import { describe, expect, it } from "vitest";
import { balance } from "../src/game/config";
import { islandCrossingLevel, simulationEnvironment } from "../src/game/level";
import {
  advanceTick,
  advanceTicks,
  createSimulation,
  feedingEfficiency,
  landEfficiency,
  movementEfficiency,
} from "../src/sim/simulation";
import type { FoodPatch } from "../src/sim/types";

function scenarioFoods(kind: "land" | "shore" | "offshore"): FoodPatch[] {
  const positions = {
    land: [[165, 190], [245, 335], [300, 465]],
    shore: [[388, 175], [412, 320], [430, 470]],
    offshore: [[485, 175], [530, 320], [565, 470]],
  }[kind];
  return [
    ...islandCrossingLevel.naturalFoods.map((food) => ({ ...food })),
    ...positions.map(([x, y], index) => ({
      id: `${kind}-${index}`,
      x,
      y,
      value: balance.playerFoodValue,
      source: "player" as const,
      placedEra: 1,
    })),
  ];
}

function runScenario(kind: "land" | "shore" | "offshore", seed = 9421) {
  const environment = simulationEnvironment(scenarioFoods(kind));
  return advanceTicks(createSimulation(seed, environment), environment, 720);
}

describe("deterministic evolution simulation", () => {
  it("replays exactly with the same seed and environment", () => {
    const environment = simulationEnvironment(scenarioFoods("offshore"));
    const first = advanceTicks(createSimulation(481021, environment), environment, 300);
    const replay = advanceTicks(createSimulation(481021, environment), environment, 300);

    expect(replay).toEqual(first);
  });

  it("keeps surviving creatures persistent and moves them only one bounded step per tick", () => {
    const environment = simulationEnvironment(scenarioFoods("shore"));
    const before = createSimulation(481021, environment);
    const after = advanceTick(before, environment);
    const beforeById = new Map(before.critters.map((critter) => [critter.id, critter]));

    expect(after.tick).toBe(1);
    expect(after.lastTickEvents.moved).toBe(before.critters.length);
    for (const critter of after.critters.filter((item) => beforeById.has(item.id))) {
      const prior = beforeById.get(critter.id)!;
      expect(Math.hypot(critter.x - prior.x, critter.y - prior.y)).toBeLessThanOrEqual(balance.baseMovementPerTick * 1.36);
      expect(critter.age).toBe(prior.age + 1);
    }
  });

  it("turns local food into energy and depletes that same patch", () => {
    const food = { id: "meal", x: 205, y: 340, value: 1, source: "natural" as const, placedEra: 0 };
    const environment = simulationEnvironment([food]);
    const initial = createSimulation(75, environment);
    const eater = { ...initial.critters[0], x: food.x, y: food.y, energy: 5, targetFoodId: food.id };
    const before = { ...initial, critters: [eater], foodLevels: { [food.id]: 5 } };
    const after = advanceTick(before, environment);

    expect(after.lastTickEvents.ate).toBe(1);
    expect(after.foodLevels[food.id]).toBeLessThan(5 + balance.foodCapacityMultiplier * balance.foodRegrowthFraction);
    expect(after.critters[0].energy).toBeGreaterThan(eater.energy);
    const record = after.lastTickRecords[eater.id];
    expect(record.targetFoodId).toBe(food.id);
    expect(record.foodIntake).toBeGreaterThan(0);
    expect(record.energyAfter).toBeCloseTo(
      record.energyBefore - record.metabolicCost - record.movementCost + record.foodEnergy,
      8,
    );
  });

  it("creates a persistent child ID only when a parent reproduces", () => {
    const food = { id: "nursery", x: 205, y: 340, value: 1, source: "natural" as const, placedEra: 0 };
    const environment = simulationEnvironment([food]);
    const initial = createSimulation(86, environment);
    const parent = {
      ...initial.critters[0],
      x: food.x,
      y: food.y,
      age: balance.minimumReproductionAge,
      energy: balance.maximumEnergy,
      reproductionCooldown: 0,
      targetFoodId: food.id,
    };
    const before = { ...initial, critters: [parent], foodLevels: { [food.id]: 5 } };
    const after = advanceTick(before, environment);
    const child = after.critters.find((critter) => critter.parentId === parent.id);

    expect(after.lastTickEvents.births).toBe(1);
    expect(child?.id).toBe(before.nextCritterId);
    expect(after.critters.some((critter) => critter.id === parent.id)).toBe(true);
  });

  it("removes a critter that cannot pay the tick's energy cost", () => {
    const environment = simulationEnvironment([]);
    const initial = createSimulation(97, environment);
    const exhausted = { ...initial.critters[0], energy: 0.001 };
    const after = advanceTick({ ...initial, critters: [exhausted] }, environment);

    expect(after.lastTickEvents.deaths).toBe(1);
    expect(after.critters).toHaveLength(0);
  });

  it("keeps land-fed populations land adapted", () => {
    const result = runScenario("land");
    expect(result.metrics.aquaticMean).toBeLessThan(0.3);
    expect(result.metrics.landPerformance).toBeGreaterThan(0.82);
  });

  it("makes shoreline food create modest swimming selection", () => {
    const land = runScenario("land");
    const shore = runScenario("shore");
    expect(shore.metrics.aquaticMean).toBeGreaterThan(land.metrics.aquaticMean);
    expect(shore.metrics.waterActivity).toBeGreaterThan(land.metrics.waterActivity);
  });

  it("makes offshore food create stronger selection than shoreline food", () => {
    const shore = runScenario("shore");
    const offshore = runScenario("offshore");
    expect(offshore.metrics.aquaticMean).toBeGreaterThan(shore.metrics.aquaticMean);
    expect(offshore.metrics.waterActivity).toBeGreaterThan(shore.metrics.waterActivity);
  });

  it("charges strong swimmers a meaningful land-performance cost", () => {
    const landSpecialist = landEfficiency(0.12);
    const generalist = landEfficiency(0.5);
    const aquaticSpecialist = landEfficiency(0.9);
    expect(landSpecialist).toBeGreaterThan(generalist);
    expect(generalist).toBeGreaterThan(aquaticSpecialist);
    expect(landSpecialist - aquaticSpecialist).toBeGreaterThan(0.4);
  });

  it("lets aquatic specialists move and feed more effectively in deep water", () => {
    expect(movementEfficiency(0.8, "deep")).toBeGreaterThan(movementEfficiency(0.15, "deep"));
    expect(feedingEfficiency(0.8, "deep")).toBeGreaterThan(feedingEfficiency(0.15, "deep"));
  });
});

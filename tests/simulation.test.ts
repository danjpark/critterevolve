import { describe, expect, it } from "vitest";
import { balance } from "../src/game/config";
import { islandCrossingLevel, simulationEnvironment } from "../src/game/level";
import { advanceGenerations, createSimulation, landEfficiency } from "../src/sim/simulation";
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
  return advanceGenerations(createSimulation(seed, environment), environment, 30);
}

describe("deterministic evolution simulation", () => {
  it("replays exactly with the same seed and environment", () => {
    const environment = simulationEnvironment(scenarioFoods("offshore"));
    const first = advanceGenerations(createSimulation(481021, environment), environment, 20);
    const replay = advanceGenerations(createSimulation(481021, environment), environment, 20);

    expect(replay).toEqual(first);
  });

  it("keeps land-fed populations land adapted", () => {
    const result = runScenario("land");
    expect(result.metrics.aquaticMean).toBeLessThan(0.25);
    expect(result.metrics.landPerformance).toBeGreaterThan(0.84);
  });

  it("makes shoreline food create modest swimming selection", () => {
    const land = runScenario("land");
    const shore = runScenario("shore");
    expect(shore.metrics.aquaticMean).toBeGreaterThan(land.metrics.aquaticMean + 0.035);
    expect(shore.metrics.waterActivity).toBeGreaterThan(land.metrics.waterActivity);
  });

  it("makes offshore food create stronger selection than shoreline food", () => {
    const shore = runScenario("shore");
    const offshore = runScenario("offshore");
    expect(offshore.metrics.aquaticMean).toBeGreaterThan(shore.metrics.aquaticMean + 0.055);
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
});

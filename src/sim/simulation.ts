import { balance } from "../game/config";
import type {
  Critter,
  CritterTickRecord,
  FoodPatch,
  Habitat,
  Point,
  SimulationEnvironment,
  SimulationMetrics,
  SimulationState,
  TickEvents,
} from "./types";
import { SeededRng } from "./rng";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function landEfficiency(aquaticMovement: number): number {
  return clamp(1 - aquaticMovement * balance.terrestrialTradeoffStrength, 0.25, 1);
}

export function movementEfficiency(aquaticMovement: number, habitat: Habitat): number {
  if (habitat === "land" || habitat === "target") return landEfficiency(aquaticMovement);
  const aquatic = 0.02 + aquaticMovement * 2.2;
  return habitat === "shallow" ? clamp(0.3 + aquatic * 0.82, 0.18, 1.25) : clamp(aquatic, 0.08, 1.35);
}

export function movementEnergyCost(aquaticMovement: number, habitat: Habitat, distance: number): number {
  const efficiency = movementEfficiency(aquaticMovement, habitat);
  if (habitat === "land" || habitat === "target") {
    return distance * balance.landMovementCost / Math.max(0.2, efficiency ** 1.5);
  }
  const base = habitat === "shallow" ? balance.shallowMovementCost : balance.deepMovementCost;
  return distance * base * clamp(1.35 - aquaticMovement, 0.3, 1.3) / Math.max(0.08, efficiency ** 1.5);
}

export function feedingEfficiency(aquaticMovement: number, habitat: Habitat): number {
  return clamp(movementEfficiency(aquaticMovement, habitat) ** 2, 0.05, 1);
}

function crossingConfidence(trait: number): number {
  return 1 / (1 + Math.exp(-(trait - 0.38) * 11));
}

function foodCapacity(patch: FoodPatch): number {
  return patch.value * balance.foodCapacityMultiplier;
}

function syncAndRegrowFood(
  levels: Record<string, number>,
  foods: FoodPatch[],
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const patch of foods) {
    const capacity = foodCapacity(patch);
    const current = levels[patch.id] ?? capacity * 0.72;
    next[patch.id] = Math.min(capacity, current + capacity * balance.foodRegrowthFraction);
  }
  return next;
}

function forageScore(
  critter: Critter,
  patch: FoodPatch,
  level: number,
  environment: SimulationEnvironment,
): number {
  if (level <= 0.01) return 0;
  const habitat = environment.habitatAt(patch);
  const distance = Math.hypot(patch.x - critter.x, patch.y - critter.y);
  let access = movementEfficiency(critter.genome.aquaticMovement, habitat);
  if (habitat === "target" && critter.habitat !== "target") {
    access = crossingConfidence(critter.genome.aquaticMovement) * landEfficiency(critter.genome.aquaticMovement);
  }
  if (critter.habitat === "target" && habitat === "land") access *= crossingConfidence(critter.genome.aquaticMovement) * 0.55;
  return ((level + foodCapacity(patch) * 0.12) * patch.value * (0.22 + access)) / (34 + distance);
}

function chooseFood(
  critter: Critter,
  environment: SimulationEnvironment,
  levels: Record<string, number>,
): FoodPatch | undefined {
  let best: FoodPatch | undefined;
  let bestScore = 0;
  for (const patch of environment.foods) {
    const score = forageScore(critter, patch, levels[patch.id] ?? 0, environment);
    if (score > bestScore) {
      best = patch;
      bestScore = score;
    }
  }
  return best;
}

function calculateMetrics(
  critters: Critter[],
  targetBirths: number,
  targetPersistenceTicks: number,
  leftShoreX: number,
): SimulationMetrics {
  const traits = critters.map((critter) => critter.genome.aquaticMovement).sort((a, b) => a - b);
  const population = critters.length;
  const aquaticMean = population === 0 ? 0 : traits.reduce((total, value) => total + value, 0) / population;
  const waterCritters = critters.filter((critter) => critter.habitat === "shallow" || critter.habitat === "deep");
  const targetPopulation = critters.filter((critter) => critter.habitat === "target").length;
  const farthestWaterX = waterCritters.reduce((maximum, critter) => Math.max(maximum, critter.x), leftShoreX);
  return {
    population,
    aquaticMean,
    aquaticMedian: traits[Math.floor(population / 2)] ?? 0,
    aquaticMin: traits[0] ?? 0,
    aquaticMax: traits.at(-1) ?? 0,
    landPerformance: landEfficiency(aquaticMean),
    waterActivity: population === 0 ? 0 : waterCritters.length / population,
    farthestOffshore: Math.max(0, farthestWaterX - leftShoreX),
    reachedTarget: targetPopulation,
    targetPopulation,
    targetBirths,
    targetPersistenceTicks,
  };
}

const emptyEvents = (): TickEvents => ({
  moved: 0,
  ate: 0,
  waterEntries: 0,
  crossings: 0,
  births: 0,
  targetBirths: 0,
  deaths: 0,
});

export function createSimulation(seed: number, environment: SimulationEnvironment): SimulationState {
  const rng = new SeededRng(seed);
  const critters: Critter[] = Array.from({ length: balance.startingPopulation }, (_, index) => {
    const trait = clamp(rng.normal(balance.startingAquaticMean, balance.startingAquaticVariation), 0.03, 0.34);
    return {
      id: index + 1,
      x: clamp(rng.normal(205, 58), 70, 330),
      y: clamp(rng.normal(340, 105), 90, 545),
      genome: { aquaticMovement: trait },
      generation: 0,
      habitat: "land",
      heading: rng.between(0, Math.PI * 2),
      energy: balance.startingEnergy,
      age: 0,
      reproductionCooldown: rng.integer(24),
      lastAction: "wandering",
    };
  });
  const foodLevels = syncAndRegrowFood({}, environment.foods);
  return {
    seed,
    rngState: rng.getState(),
    tick: 0,
    generation: 0,
    nextCritterId: critters.length + 1,
    critters,
    foodLevels,
    targetBirths: 0,
    targetPersistenceTicks: 0,
    lastTickEvents: emptyEvents(),
    lastTickRecords: {},
    metrics: calculateMetrics(critters, 0, 0, environment.leftShoreX),
  };
}

function mutateTrait(trait: number, rng: SeededRng): number {
  if (rng.next() >= balance.mutationRate) return trait;
  return clamp(trait + rng.normal(0, balance.mutationMagnitude), 0.01, 0.99);
}

/**
 * Advance exactly one causal simulation tick.
 *
 * Update order is fixed: regrow food; then for each persistent creature sense,
 * steer, move, pay energy, eat, reproduce or die; finally record colony state.
 * Rendering and playback speed never participate in this function.
 */
export function advanceTick(state: SimulationState, environment: SimulationEnvironment): SimulationState {
  const rng = new SeededRng(state.rngState);
  const foodLevels = syncAndRegrowFood(state.foodLevels, environment.foods);
  const foodsById = new Map(environment.foods.map((patch) => [patch.id, patch]));
  const events = emptyEvents();
  const survivors: Critter[] = [];
  const newborns: Critter[] = [];
  let nextCritterId = state.nextCritterId;
  let targetBirths = state.targetBirths;
  let maximumGeneration = state.generation;
  const lastTickRecords: Record<number, CritterTickRecord> = {};

  for (const previous of state.critters) {
    const critter: Critter = { ...previous, genome: { ...previous.genome } };
    const previousHabitat = critter.habitat;
    const from = { x: critter.x, y: critter.y };
    const energyBefore = critter.energy;
    const currentTarget = critter.targetFoodId ? foodsById.get(critter.targetFoodId) : undefined;
    const shouldReconsider = !currentTarget || (foodLevels[currentTarget.id] ?? 0) < 0.03 || (state.tick + critter.id) % 12 === 0;
    const target = shouldReconsider ? chooseFood(critter, environment, foodLevels) : currentTarget;

    if (target) {
      critter.targetFoodId = target.id;
      const desiredHeading = Math.atan2(target.y - critter.y, target.x - critter.x);
      const turnNoise = rng.normal(0, 0.025 + (1 - critter.genome.aquaticMovement) * 0.018);
      critter.heading = desiredHeading + turnNoise;
      critter.lastAction = "moving";
    } else {
      critter.heading += rng.normal(0, 0.24);
      critter.lastAction = "wandering";
      critter.targetFoodId = undefined;
    }

    const probe: Point = {
      x: clamp(critter.x + Math.cos(critter.heading) * balance.baseMovementPerTick, 8, environment.width - 8),
      y: clamp(critter.y + Math.sin(critter.heading) * balance.baseMovementPerTick, 24, environment.height - 20),
    };
    const nextHabitat = environment.habitatAt(probe);
    const travel = balance.baseMovementPerTick * movementEfficiency(critter.genome.aquaticMovement, nextHabitat);
    const nextX = clamp(critter.x + Math.cos(critter.heading) * travel, 8, environment.width - 8);
    const nextY = clamp(critter.y + Math.sin(critter.heading) * travel, 24, environment.height - 20);
    const actualDistance = Math.hypot(nextX - critter.x, nextY - critter.y);
    critter.x = nextX;
    critter.y = nextY;
    critter.habitat = environment.habitatAt(critter);
    const tickMovementEfficiency = movementEfficiency(critter.genome.aquaticMovement, critter.habitat);
    const tickMovementCost = movementEnergyCost(critter.genome.aquaticMovement, critter.habitat, actualDistance);
    critter.energy -= balance.baseMetabolicCost + tickMovementCost;
    events.moved += 1;
    if ((previousHabitat === "land" || previousHabitat === "target") && (critter.habitat === "shallow" || critter.habitat === "deep")) {
      events.waterEntries += 1;
    }
    if (previousHabitat !== "target" && critter.habitat === "target") events.crossings += 1;

    const reachedFood = target && Math.hypot(target.x - critter.x, target.y - critter.y) <= balance.eatingRadius;
    let foodIntake = 0;
    let foodEnergy = 0;
    if (target && reachedFood) {
      const available = foodLevels[target.id] ?? 0;
      const intake = Math.min(
        available,
        balance.foodIntakePerTick * feedingEfficiency(critter.genome.aquaticMovement, critter.habitat),
      );
      if (intake > 0) {
        foodIntake = intake;
        const energyBeforeEating = critter.energy;
        foodLevels[target.id] = available - intake;
        critter.energy = Math.min(balance.maximumEnergy, critter.energy + intake * balance.foodEnergyPerUnit);
        foodEnergy = critter.energy - energyBeforeEating;
        critter.lastAction = "eating";
        events.ate += 1;
      }
    }

    critter.age += 1;
    critter.reproductionCooldown = Math.max(0, critter.reproductionCooldown - 1);
    const canReproduce =
      critter.energy >= balance.reproductionThreshold &&
      critter.age >= balance.minimumReproductionAge &&
      critter.reproductionCooldown === 0 &&
      survivors.length + newborns.length + state.critters.length < balance.maximumPopulation * 2;

    let childId: number | undefined;
    if (canReproduce && survivors.length + newborns.length < balance.maximumPopulation) {
      critter.energy -= balance.reproductionCost;
      critter.reproductionCooldown = balance.reproductionCooldownTicks;
      critter.lastAction = "reproducing";
      const generation = critter.generation + 1;
      const child: Critter = {
        id: nextCritterId++,
        parentId: critter.id,
        x: clamp(critter.x + rng.normal(0, 5), 8, environment.width - 8),
        y: clamp(critter.y + rng.normal(0, 5), 24, environment.height - 20),
        genome: { aquaticMovement: mutateTrait(critter.genome.aquaticMovement, rng) },
        generation,
        habitat: critter.habitat,
        heading: rng.between(0, Math.PI * 2),
        energy: balance.offspringStartingEnergy,
        age: 0,
        reproductionCooldown: balance.reproductionCooldownTicks,
        targetFoodId: critter.targetFoodId,
        lastAction: "wandering",
      };
      childId = child.id;
      newborns.push(child);
      maximumGeneration = Math.max(maximumGeneration, generation);
      events.births += 1;
      if (critter.habitat === "target") {
        targetBirths += 1;
        events.targetBirths += 1;
      }
    }

    const survived = critter.energy > 0 && critter.age < balance.maximumAgeTicks;
    if (survived) survivors.push(critter);
    else events.deaths += 1;
    lastTickRecords[critter.id] = {
      critterId: critter.id,
      tick: state.tick + 1,
      targetFoodId: target?.id,
      action: survived ? critter.lastAction : "died",
      from,
      to: { x: critter.x, y: critter.y },
      habitatFrom: previousHabitat,
      habitatTo: critter.habitat,
      movementEfficiency: tickMovementEfficiency,
      plannedDistance: travel,
      actualDistance,
      energyBefore,
      metabolicCost: balance.baseMetabolicCost,
      movementCost: tickMovementCost,
      foodIntake,
      foodEnergy,
      energyAfter: critter.energy,
      reproduced: childId !== undefined,
      childId,
    };
  }

  const critters = [...survivors, ...newborns].slice(0, balance.maximumPopulation);
  const targetPopulation = critters.filter((critter) => critter.habitat === "target").length;
  const targetPersistenceTicks = targetPopulation >= 8 ? state.targetPersistenceTicks + 1 : 0;
  const metrics = calculateMetrics(critters, targetBirths, targetPersistenceTicks, environment.leftShoreX);

  return {
    ...state,
    rngState: rng.getState(),
    tick: state.tick + 1,
    generation: maximumGeneration,
    nextCritterId,
    critters,
    foodLevels,
    targetBirths,
    targetPersistenceTicks,
    lastTickEvents: events,
    lastTickRecords,
    metrics,
  };
}

export function advanceTicks(
  state: SimulationState,
  environment: SimulationEnvironment,
  ticks: number,
): SimulationState {
  let next = state;
  for (let tick = 0; tick < ticks; tick += 1) next = advanceTick(next, environment);
  return next;
}

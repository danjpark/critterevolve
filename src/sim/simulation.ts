import { balance } from "../game/config";
import type {
  Critter,
  FoodPatch,
  Habitat,
  Point,
  SimulationEnvironment,
  SimulationMetrics,
  SimulationState,
} from "./types";
import { SeededRng, weightedIndex } from "./rng";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function landEfficiency(aquaticMovement: number): number {
  return clamp(1 - aquaticMovement * balance.terrestrialTradeoffStrength, 0.25, 1);
}

function waterDemand(habitat: Habitat): number {
  if (habitat === "shallow") return 0.34;
  if (habitat === "deep") return 0.78;
  if (habitat === "target") return 0.58;
  return 0;
}

function crossingFactor(trait: number): number {
  return 1 / (1 + Math.exp(-(trait - 0.39) * 12));
}

/** How profitably one animal can use one patch. This is simulation logic, not UI. */
export function patchOpportunity(critter: Critter, patch: FoodPatch, environment: SimulationEnvironment): number {
  const habitat = environment.habitatAt(patch);
  const trait = critter.genome.aquaticMovement;
  const land = landEfficiency(trait);
  const aquatic = 0.1 + trait * 1.35;
  const demand = waterDemand(habitat);
  const distance = Math.hypot(patch.x - critter.x, patch.y - critter.y);
  const distanceFactor = 1 / (1 + distance / 285);

  let movement = land ** 1.55;
  if (habitat === "shallow") movement = aquatic ** 1.15 * land ** 0.45;
  if (habitat === "deep") movement = aquatic ** 2.25 * land ** 0.22;
  if (habitat === "target") movement = crossingFactor(trait) * land ** 1.75;

  // Animals already on the target island do not pay the channel-crossing gate again.
  if (critter.habitat === "target" && habitat === "target") movement = land ** 1.65 * 1.32;
  // Returning to the starting island also requires swimming for an established colonist.
  if (critter.habitat === "target" && habitat === "land") movement *= crossingFactor(trait) * 0.55;

  const depthCost = 1 - demand * (0.46 - trait * 0.34);
  return Math.max(0.001, patch.value * movement * distanceFactor * depthCost);
}

function calculateMetrics(
  critters: Critter[],
  targetBirths: number,
  targetPersistenceGenerations: number,
  leftShoreX: number,
): SimulationMetrics {
  const traits = critters.map((critter) => critter.genome.aquaticMovement).sort((a, b) => a - b);
  const population = critters.length;
  const sum = traits.reduce((total, value) => total + value, 0);
  const waterCritters = critters.filter((critter) => critter.habitat === "shallow" || critter.habitat === "deep");
  const targetPopulation = critters.filter((critter) => critter.habitat === "target").length;
  const farthestWaterX = waterCritters.reduce((maximum, critter) => Math.max(maximum, critter.x), leftShoreX);
  const median = population === 0 ? 0 : traits[Math.floor(population / 2)];
  const aquaticMean = population === 0 ? 0 : sum / population;
  return {
    population,
    aquaticMean,
    aquaticMedian: median,
    aquaticMin: traits[0] ?? 0,
    aquaticMax: traits.at(-1) ?? 0,
    landPerformance: landEfficiency(aquaticMean),
    waterActivity: population === 0 ? 0 : waterCritters.length / population,
    farthestOffshore: Math.max(0, farthestWaterX - leftShoreX),
    reachedTarget: targetPopulation,
    targetPopulation,
    targetBirths,
    targetPersistenceGenerations,
  };
}

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
    };
  });
  const metrics = calculateMetrics(critters, 0, 0, environment.leftShoreX);
  return {
    seed,
    rngState: rng.getState(),
    tick: 0,
    generation: 0,
    nextCritterId: critters.length + 1,
    critters,
    targetBirths: 0,
    targetPersistenceGenerations: 0,
    metrics,
  };
}

interface EvaluatedCritter {
  critter: Critter;
  patchWeights: number[];
  fitness: number;
}

export function advanceGeneration(state: SimulationState, environment: SimulationEnvironment): SimulationState {
  const rng = new SeededRng(state.rngState);
  const evaluated: EvaluatedCritter[] = state.critters.map((critter) => {
    const patchWeights = environment.foods.map((patch) => patchOpportunity(critter, patch, environment));
    return { critter, patchWeights, fitness: patchWeights.reduce((sum, value) => sum + value, 0) };
  });
  const fitnessWeights = evaluated.map((entry) => entry.fitness ** 1.48);
  const meanFitness = evaluated.reduce((sum, entry) => sum + entry.fitness, 0) / Math.max(1, evaluated.length);
  const meanTrait = state.metrics.aquaticMean;
  const ecologicalCapacity = 62 + environment.foods.reduce((sum, patch) => sum + patch.value * 18, 0);
  const poorForagingPenalty = Math.max(0, 0.72 - meanFitness) * 26;
  const specializationPenalty = Math.max(0, meanTrait - 0.68) * 72;
  const desiredPopulation = clamp(
    Math.round(ecologicalCapacity - poorForagingPenalty - specializationPenalty),
    balance.minimumPopulation,
    balance.maximumPopulation,
  );
  const nextPopulation = clamp(
    Math.round(state.critters.length * 0.62 + desiredPopulation * 0.38),
    balance.minimumPopulation,
    balance.maximumPopulation,
  );

  let targetBirthsThisGeneration = 0;
  const nextCritters: Critter[] = [];
  for (let index = 0; index < nextPopulation; index += 1) {
    const parentEntry = evaluated[weightedIndex(fitnessWeights, rng)];
    const patch = environment.foods[weightedIndex(parentEntry.patchWeights, rng)];
    const habitat = environment.habitatAt(patch);
    let trait = parentEntry.critter.genome.aquaticMovement;
    if (rng.next() < balance.mutationRate) trait += rng.normal(0, balance.mutationMagnitude);
    trait = clamp(trait, 0.01, 0.99);

    const onTarget = habitat === "target";
    if (onTarget && parentEntry.critter.habitat === "target") targetBirthsThisGeneration += 1;
    const spread = habitat === "land" || habitat === "target" ? 48 : 34;
    const position: Point = {
      x: clamp(rng.normal(patch.x, spread), 12, environment.width - 12),
      y: clamp(rng.normal(patch.y, spread), 28, environment.height - 22),
    };
    const actualHabitat = environment.habitatAt(position);
    nextCritters.push({
      id: state.nextCritterId + index,
      parentId: parentEntry.critter.id,
      x: position.x,
      y: position.y,
      genome: { aquaticMovement: trait },
      generation: state.generation + 1,
      habitat: actualHabitat,
    });
  }

  const targetPopulation = nextCritters.filter((critter) => critter.habitat === "target").length;
  const persistence = targetPopulation >= 8 ? state.targetPersistenceGenerations + 1 : 0;
  const targetBirths = state.targetBirths + targetBirthsThisGeneration;
  const metrics = calculateMetrics(nextCritters, targetBirths, persistence, environment.leftShoreX);
  return {
    ...state,
    rngState: rng.getState(),
    tick: state.tick + balance.ticksPerGeneration,
    generation: state.generation + 1,
    nextCritterId: state.nextCritterId + nextPopulation,
    critters: nextCritters,
    targetBirths,
    targetPersistenceGenerations: persistence,
    metrics,
  };
}

export function advanceGenerations(
  state: SimulationState,
  environment: SimulationEnvironment,
  generations: number,
): SimulationState {
  let next = state;
  for (let generation = 0; generation < generations; generation += 1) {
    next = advanceGeneration(next, environment);
  }
  return next;
}

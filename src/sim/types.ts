export type Habitat = "land" | "shallow" | "deep" | "target";

export interface Point {
  x: number;
  y: number;
}

export interface Genome {
  aquaticMovement: number;
}

export interface Critter extends Point {
  id: number;
  genome: Genome;
  generation: number;
  habitat: Habitat;
}

export interface FoodPatch extends Point {
  id: string;
  value: number;
  source: "natural" | "player";
  placedEra: number;
}

export interface SimulationMetrics {
  population: number;
  aquaticMean: number;
  aquaticMedian: number;
  aquaticMin: number;
  aquaticMax: number;
  landPerformance: number;
  waterActivity: number;
  farthestOffshore: number;
  reachedTarget: number;
  targetPopulation: number;
  targetBirths: number;
  targetPersistenceGenerations: number;
}

export interface SimulationState {
  seed: number;
  rngState: number;
  tick: number;
  generation: number;
  nextCritterId: number;
  critters: Critter[];
  targetBirths: number;
  targetPersistenceGenerations: number;
  metrics: SimulationMetrics;
}

export interface SimulationEnvironment {
  foods: FoodPatch[];
  habitatAt(point: Point): Habitat;
  leftShoreX: number;
  targetShoreX: number;
  width: number;
  height: number;
}

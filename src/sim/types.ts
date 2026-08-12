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
  parentId?: number;
  genome: Genome;
  generation: number;
  habitat: Habitat;
  heading: number;
  energy: number;
  age: number;
  reproductionCooldown: number;
  targetFoodId?: string;
  lastAction: "moving" | "eating" | "reproducing" | "wandering";
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
  targetPersistenceTicks: number;
}

export interface TickEvents {
  moved: number;
  ate: number;
  waterEntries: number;
  crossings: number;
  births: number;
  targetBirths: number;
  deaths: number;
}

export interface CritterTickRecord {
  critterId: number;
  tick: number;
  targetFoodId?: string;
  action: Critter["lastAction"] | "died";
  from: Point;
  to: Point;
  habitatFrom: Habitat;
  habitatTo: Habitat;
  movementEfficiency: number;
  plannedDistance: number;
  actualDistance: number;
  energyBefore: number;
  metabolicCost: number;
  movementCost: number;
  foodIntake: number;
  foodEnergy: number;
  energyAfter: number;
  reproduced: boolean;
  childId?: number;
}

export interface SimulationState {
  seed: number;
  rngState: number;
  tick: number;
  generation: number;
  nextCritterId: number;
  critters: Critter[];
  foodLevels: Record<string, number>;
  targetBirths: number;
  targetPersistenceTicks: number;
  lastTickEvents: TickEvents;
  lastTickRecords: Record<number, CritterTickRecord>;
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

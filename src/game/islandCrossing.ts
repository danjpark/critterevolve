import { advanceGenerations, createSimulation } from "../sim/simulation";
import type { FoodPatch, Habitat, Point, SimulationMetrics, SimulationState } from "../sim/types";
import { balance } from "./config";
import { habitatAt, islandCrossingLevel, simulationEnvironment } from "./level";

export interface PlaceFoodIntervention extends Point {
  type: "place-food";
  era: number;
  habitat: Habitat;
}

export interface EraSummary {
  era: number;
  before: SimulationMetrics;
  after: SimulationMetrics;
}

export type GamePhase = "player" | "summary" | "won" | "lost";

export interface IslandCrossingState {
  seed: number;
  era: number;
  phase: GamePhase;
  sim: SimulationState;
  interventions: PlaceFoodIntervention[];
  summaries: EraSummary[];
  resultReason?: string;
}

export type PlaceFoodResult =
  | { ok: true; state: IslandCrossingState }
  | { ok: false; reason: string };

export function createGame(seed = 481021): IslandCrossingState {
  const sim = createSimulation(seed, simulationEnvironment(islandCrossingLevel.naturalFoods.map((food) => ({ ...food }))));
  return { seed, era: 1, phase: "player", sim, interventions: [], summaries: [] };
}

export function placementsThisEra(state: IslandCrossingState): number {
  return state.interventions.filter((item) => item.era === state.era).length;
}

export function remainingPlacements(state: IslandCrossingState): number {
  return Math.max(0, balance.foodPatchesPerEra - placementsThisEra(state));
}

export function placeFood(state: IslandCrossingState, point: Point): PlaceFoodResult {
  if (state.phase !== "player") return { ok: false, reason: "Finish the era summary first." };
  if (remainingPlacements(state) <= 0) return { ok: false, reason: "No food patches remain this era." };
  if (point.x < 18 || point.x > islandCrossingLevel.width - 18 || point.y < 34 || point.y > islandCrossingLevel.height - 22) {
    return { ok: false, reason: "Place food inside the habitat." };
  }
  const tooClose = state.interventions.some(
    (item) => item.era === state.era && Math.hypot(item.x - point.x, item.y - point.y) < 38,
  );
  if (tooClose) return { ok: false, reason: "Give each food patch a little room." };
  const intervention: PlaceFoodIntervention = {
    type: "place-food",
    era: state.era,
    x: Math.round(point.x),
    y: Math.round(point.y),
    habitat: habitatAt(point),
  };
  return { ok: true, state: { ...state, interventions: [...state.interventions, intervention] } };
}

export function activeFoods(state: IslandCrossingState): FoodPatch[] {
  const oldestEra = state.era - balance.foodLifetimeEras + 1;
  const playerFoods: FoodPatch[] = state.interventions
    .filter((item) => item.era >= oldestEra && item.era <= state.era)
    .map((item, index) => ({
      id: `player-${item.era}-${index}-${item.x}-${item.y}`,
      x: item.x,
      y: item.y,
      value: balance.playerFoodValue,
      source: "player",
      placedEra: item.era,
    }));
  return [...islandCrossingLevel.naturalFoods.map((food) => ({ ...food })), ...playerFoods];
}

export function isColonyEstablished(metrics: SimulationMetrics): boolean {
  return (
    metrics.targetPopulation >= balance.targetPopulationRequired &&
    metrics.targetBirths >= balance.targetBirthsRequired &&
    metrics.targetPersistenceGenerations >= balance.targetPersistenceRequired
  );
}

function lossReason(metrics: SimulationMetrics): string {
  if (metrics.aquaticMean > 0.63 && metrics.landPerformance < 0.66) {
    return "Your critters became powerful swimmers, but gave up too much land efficiency to sustain the new colony.";
  }
  if (metrics.aquaticMean < 0.31) {
    return "The population remained strongly land-adapted and never learned to cross the deep channel.";
  }
  if (metrics.targetPopulation > 0) {
    return "Explorers reached the far shore, but too few local births followed to establish a lasting colony.";
  }
  return "The population adapted, but not enough swimmers completed the channel crossing in time.";
}

export function advanceEra(state: IslandCrossingState): IslandCrossingState {
  if (state.phase !== "player") return state;
  const before = state.sim.metrics;
  const environment = simulationEnvironment(activeFoods(state));
  const sim = advanceGenerations(state.sim, environment, balance.generationsPerEra);
  const summary = { era: state.era, before, after: sim.metrics };
  const summaries = [...state.summaries, summary];
  if (isColonyEstablished(sim.metrics)) {
    return { ...state, sim, summaries, phase: "won", resultReason: "A self-sustaining colony has taken root." };
  }
  if (state.era >= balance.maxEras) {
    return { ...state, sim, summaries, phase: "lost", resultReason: lossReason(sim.metrics) };
  }
  return { ...state, sim, summaries, phase: "summary" };
}

export function beginNextEra(state: IslandCrossingState): IslandCrossingState {
  if (state.phase !== "summary") return state;
  return { ...state, era: state.era + 1, phase: "player" };
}

export function runId(state: IslandCrossingState): string {
  const source = JSON.stringify({
    game: balance.gameVersion,
    level: balance.levelVersion,
    seed: state.seed,
    actions: state.interventions.map(({ era, x, y }) => [era, x, y]),
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

export function exportRun(state: IslandCrossingState): string {
  return JSON.stringify(
    {
      gameVersion: balance.gameVersion,
      levelVersion: balance.levelVersion,
      runId: runId(state),
      seed: state.seed,
      era: state.era,
      phase: state.phase,
      interventions: state.interventions,
      finalMetrics: state.sim.metrics,
    },
    null,
    2,
  );
}

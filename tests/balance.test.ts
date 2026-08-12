import { describe, expect, it } from "vitest";
import {
  advanceEra,
  beginNextEra,
  createGame,
  placeFood,
  type IslandCrossingState,
} from "../src/game/islandCrossing";
import { SeededRng } from "../src/sim/rng";
import type { Point } from "../src/sim/types";

type Strategy = (era: number, seed: number) => Point[];

const benchmarkSeeds = [101, 907, 2027, 4810, 9421, 16381, 27183, 481021, 702101, 991027];

const landStrategy: Strategy = () => [
  { x: 150, y: 180 },
  { x: 230, y: 320 },
  { x: 300, y: 460 },
];

const shorelineStrategy: Strategy = () => [
  { x: 390, y: 180 },
  { x: 415, y: 320 },
  { x: 430, y: 470 },
];

const immediateOffshoreStrategy: Strategy = () => [
  { x: 485, y: 175 },
  { x: 535, y: 320 },
  { x: 575, y: 470 },
];

const gradualStrategy: Strategy = (era) => {
  const placements = [
    [[390, 180], [415, 320], [430, 470]],
    [[430, 160], [475, 310], [515, 465]],
    [[500, 170], [550, 320], [610, 465]],
    [[600, 170], [640, 325], [705, 465]],
    [[705, 175], [760, 320], [820, 465]],
  ];
  return placements[era - 1].map(([x, y]) => ({ x, y }));
};

const randomStrategy: Strategy = (era, seed) => {
  const rng = new SeededRng((seed ^ Math.imul(era, 0x9e3779b1)) >>> 0);
  const placements: Point[] = [];
  while (placements.length < 3) {
    const candidate = { x: rng.between(80, 920), y: rng.between(70, 550) };
    if (placements.every((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) >= 50)) {
      placements.push(candidate);
    }
  }
  return placements;
};

function play(seed: number, strategy: Strategy): IslandCrossingState {
  let state = createGame(seed);
  for (let era = 1; era <= 5; era += 1) {
    for (const point of strategy(era, seed)) {
      const placement = placeFood(state, point);
      if (!placement.ok) throw new Error(placement.reason);
      state = placement.state;
    }
    state = advanceEra(state);
    if (state.phase === "won" || state.phase === "lost") break;
    state = beginNextEra(state);
  }
  return state;
}

function benchmark(strategy: Strategy) {
  const runs = benchmarkSeeds.map((seed) => play(seed, strategy));
  const mean = (select: (state: IslandCrossingState) => number) =>
    runs.reduce((sum, state) => sum + select(state), 0) / runs.length;
  return {
    wins: runs.filter((state) => state.phase === "won").length,
    aquaticMean: mean((state) => state.sim.metrics.aquaticMean),
    landPerformance: mean((state) => state.sim.metrics.landPerformance),
    population: mean((state) => state.sim.metrics.population),
    targetPopulation: mean((state) => state.sim.metrics.targetPopulation),
  };
}

describe("five-era strategy balance", () => {
  it("makes deliberate gradual pressure outperform random placement", () => {
    const gradual = benchmark(gradualStrategy);
    const random = benchmark(randomStrategy);
    expect(gradual.wins).toBeGreaterThanOrEqual(8);
    expect(random.wins).toBeLessThanOrEqual(6);
    expect(gradual.wins - random.wins).toBeGreaterThanOrEqual(3);
    expect(gradual.wins).toBeGreaterThan(random.wins);
    expect(gradual.targetPopulation).toBeGreaterThan(random.targetPopulation * 2);
  }, 20_000);

  it("keeps land, shoreline, and immediate-offshore strategies ecologically distinct", () => {
    const land = benchmark(landStrategy);
    const shoreline = benchmark(shorelineStrategy);
    const offshore = benchmark(immediateOffshoreStrategy);
    expect(shoreline.aquaticMean).toBeGreaterThan(land.aquaticMean);
    expect(offshore.aquaticMean).toBeGreaterThan(shoreline.aquaticMean);
    expect(land.landPerformance).toBeGreaterThan(offshore.landPerformance);
    expect(offshore.population).toBeLessThan(shoreline.population);
  }, 20_000);
});

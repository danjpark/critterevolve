import { describe, expect, it } from "vitest";
import {
  advanceEra,
  advanceEraTick,
  beginEraSimulation,
  beginNextEra,
  createGame,
  exportRun,
  placeFood,
  remainingPlacements,
  runId,
  type IslandCrossingState,
} from "../src/game/islandCrossing";

function place(state: IslandCrossingState, x: number, y: number): IslandCrossingState {
  const result = placeFood(state, { x, y });
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

describe("Island Crossing game rules", () => {
  it("validates the three-patch player budget", () => {
    let state = createGame(12);
    state = place(state, 200, 200);
    state = place(state, 300, 300);
    state = place(state, 400, 400);
    expect(remainingPlacements(state)).toBe(0);
    expect(placeFood(state, { x: 500, y: 500 })).toMatchObject({ ok: false });
  });

  it("records every intervention with era, habitat, and coordinates", () => {
    let state = createGame(12);
    state = place(state, 520.3, 310.8);
    expect(state.interventions[0]).toEqual({
      type: "place-food",
      era: 1,
      x: 520,
      y: 311,
      habitat: "deep",
    });
  });

  it("runs exactly five eras before a loss", () => {
    let state = createGame(44);
    for (let era = 1; era <= 5; era += 1) {
      state = place(state, 150, 180);
      state = place(state, 230, 320);
      state = place(state, 300, 460);
      state = advanceEra(state);
      if (era < 5) state = beginNextEra(state);
    }
    expect(state.era).toBe(5);
    expect(state.phase).toBe("lost");
    expect(state.summaries).toHaveLength(5);
    expect(state.resultReason).toMatch(/land-adapted|cross/i);
  });

  it("exposes the same deterministic era one causal tick at a time", () => {
    let prepared = createGame(481021);
    prepared = place(prepared, 390, 180);
    prepared = place(prepared, 415, 320);
    prepared = place(prepared, 430, 470);

    const instant = advanceEra(prepared);
    let visible = beginEraSimulation(prepared);
    expect(visible.phase).toBe("simulating");
    const startingIds = new Set(visible.sim.critters.map((critter) => critter.id));
    for (let tick = 0; tick < 240; tick += 1) {
      visible = advanceEraTick(visible);
      expect(visible.sim.tick).toBe(tick + 1);
    }

    expect(visible).toEqual(instant);
    expect(visible.sim.critters.some((critter) => startingIds.has(critter.id))).toBe(true);
  });

  it("produces stable compact run IDs and complete replay data", () => {
    let first = place(createGame(99), 410, 300);
    let replay = place(createGame(99), 410, 300);
    expect(runId(first)).toBe(runId(replay));
    replay = place(replay, 520, 300);
    expect(runId(first)).not.toBe(runId(replay));
    expect(JSON.parse(exportRun(first))).toMatchObject({ seed: 99, interventions: [{ era: 1 }] });
  });

  it("allows a gradual shoreline-to-island strategy to establish a colony", () => {
    const strategy = [
      [[390, 180], [415, 320], [430, 470]],
      [[430, 160], [475, 310], [515, 465]],
      [[500, 170], [550, 320], [610, 465]],
      [[600, 170], [640, 325], [705, 465]],
      [[705, 175], [760, 320], [820, 465]],
    ];
    let state = createGame(481021);
    for (const eraPlacements of strategy) {
      for (const [x, y] of eraPlacements) state = place(state, x, y);
      state = advanceEra(state);
      if (state.phase === "won") break;
      state = beginNextEra(state);
    }
    expect(state.phase, JSON.stringify(state.sim.metrics)).toBe("won");
    expect(state.sim.metrics.targetPopulation).toBeGreaterThanOrEqual(20);
    expect(state.sim.metrics.targetBirths).toBeGreaterThanOrEqual(5);
  });
});

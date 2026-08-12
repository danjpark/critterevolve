import { describe, expect, it } from "vitest";
import { balance } from "../src/game/config";
import {
  advanceEra,
  beginNextEra,
  createGame,
  placeFood,
  type IslandCrossingState,
} from "../src/game/islandCrossing";
import {
  applyReplayEra,
  createReplayGame,
  decodeReplay,
  encodeReplay,
  replayFromUrl,
  replayPayload,
  replayUrl,
} from "../src/game/replay";

const gradualPlacements = [
  [[390, 180], [415, 320], [430, 470]],
  [[430, 160], [475, 310], [515, 465]],
  [[500, 170], [550, 320], [610, 465]],
  [[600, 170], [640, 325], [705, 465]],
  [[705, 175], [760, 320], [820, 465]],
];

function playOriginal(seed: number): IslandCrossingState {
  let state = createGame(seed);
  for (const eraPlacements of gradualPlacements) {
    for (const [x, y] of eraPlacements) {
      const result = placeFood(state, { x, y });
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
    }
    state = advanceEra(state);
    if (state.phase === "won" || state.phase === "lost") break;
    state = beginNextEra(state);
  }
  return state;
}

function playReplay(original: IslandCrossingState): IslandCrossingState {
  const decoded = decodeReplay(encodeReplay(replayPayload(original)));
  if (!decoded.ok) throw new Error(decoded.reason);
  let state = createReplayGame(decoded.payload);
  while (state.phase !== "won" && state.phase !== "lost") {
    state = advanceEra(state);
    if (state.phase === "summary") {
      state = applyReplayEra(beginNextEra(state), decoded.payload);
    }
  }
  return state;
}

describe("shareable deterministic replays", () => {
  it("encodes URL-safe input and restores it from a clean replay URL", () => {
    const original = playOriginal(481021);
    const url = replayUrl(original, "https://example.com/critterevolve/?old=value#fragment");
    const parsed = new URL(url);
    const restored = replayFromUrl(url);

    expect(parsed.origin + parsed.pathname).toBe("https://example.com/critterevolve/");
    expect(parsed.searchParams.has("old")).toBe(false);
    expect(parsed.hash).toBe("");
    expect(parsed.searchParams.get("replay")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(restored).toEqual({ ok: true, payload: replayPayload(original) });
  }, 20_000);

  it("recomputes exactly the same final game from the shared inputs", () => {
    const original = playOriginal(481021);
    expect(playReplay(original)).toEqual(original);
  }, 20_000);

  it("rejects damaged, mismatched, and overlapping replay inputs", () => {
    expect(decodeReplay("not-a-replay")).toMatchObject({ ok: false });
    const wrongVersion = encodeReplay({
      format: 1,
      gameVersion: "old-version",
      levelVersion: "island-crossing-1",
      seed: 4,
      actions: [],
    });
    expect(decodeReplay(wrongVersion)).toMatchObject({ ok: false, reason: expect.stringMatching(/version/i) });
    const overlapping = encodeReplay({
      format: 1,
      gameVersion: balance.gameVersion,
      levelVersion: "island-crossing-1",
      seed: 4,
      actions: [{ era: 1, x: 200, y: 200 }, { era: 1, x: 205, y: 205 }],
    });
    expect(decodeReplay(overlapping)).toMatchObject({ ok: false, reason: expect.stringMatching(/overlap/i) });
  });
});

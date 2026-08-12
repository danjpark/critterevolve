import { balance } from "./config";
import {
  createGame,
  placeFood,
  type IslandCrossingState,
} from "./islandCrossing";
import { islandCrossingLevel } from "./level";

export interface ReplayAction {
  era: number;
  x: number;
  y: number;
}

export interface ReplayPayload {
  format: 1;
  gameVersion: string;
  levelVersion: string;
  seed: number;
  actions: ReplayAction[];
}

export type ReplayDecodeResult =
  | { ok: true; payload: ReplayPayload }
  | { ok: false; reason: string };

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
}

function isReplayAction(value: unknown): value is ReplayAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<ReplayAction>;
  return (
    Number.isInteger(action.era) &&
    action.era! >= 1 &&
    action.era! <= balance.maxEras &&
    Number.isFinite(action.x) &&
    action.x! >= 18 &&
    action.x! <= islandCrossingLevel.width - 18 &&
    Number.isFinite(action.y) &&
    action.y! >= 34 &&
    action.y! <= islandCrossingLevel.height - 22
  );
}

function validateActions(actions: ReplayAction[]): string | undefined {
  if (actions.length > balance.maxEras * balance.foodPatchesPerEra) return "Replay contains too many food placements.";
  for (let era = 1; era <= balance.maxEras; era += 1) {
    const eraActions = actions.filter((action) => action.era === era);
    if (eraActions.length > balance.foodPatchesPerEra) return `Replay contains too many placements in era ${era}.`;
    for (let index = 0; index < eraActions.length; index += 1) {
      for (let other = index + 1; other < eraActions.length; other += 1) {
        if (Math.hypot(eraActions[index].x - eraActions[other].x, eraActions[index].y - eraActions[other].y) < 38) {
          return `Replay placements overlap in era ${era}.`;
        }
      }
    }
  }
  return undefined;
}

export function replayPayload(state: IslandCrossingState): ReplayPayload {
  return {
    format: 1,
    gameVersion: balance.gameVersion,
    levelVersion: balance.levelVersion,
    seed: state.seed,
    actions: state.interventions.map(({ era, x, y }) => ({ era, x, y })),
  };
}

export function encodeReplay(payload: ReplayPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeReplay(encoded: string): ReplayDecodeResult {
  try {
    const value = JSON.parse(fromBase64Url(encoded)) as Partial<ReplayPayload>;
    if (value.format !== 1) return { ok: false, reason: "Unsupported replay format." };
    if (value.gameVersion !== balance.gameVersion || value.levelVersion !== balance.levelVersion) {
      return { ok: false, reason: "This replay was recorded with a different game or level version." };
    }
    const seed = value.seed;
    if (!Number.isInteger(seed) || seed === undefined || seed < 0 || seed > 0xffffffff) {
      return { ok: false, reason: "Replay seed is invalid." };
    }
    if (!Array.isArray(value.actions) || !value.actions.every(isReplayAction)) {
      return { ok: false, reason: "Replay food placements are invalid." };
    }
    const actions = value.actions.map(({ era, x, y }) => ({ era, x: Math.round(x), y: Math.round(y) }));
    const actionError = validateActions(actions);
    if (actionError) return { ok: false, reason: actionError };
    return {
      ok: true,
      payload: {
        format: 1,
        gameVersion: value.gameVersion,
        levelVersion: value.levelVersion,
        seed,
        actions,
      },
    };
  } catch {
    return { ok: false, reason: "Replay link is damaged or incomplete." };
  }
}

export function replayUrl(state: IslandCrossingState, currentUrl: string): string {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("replay", encodeReplay(replayPayload(state)));
  return url.toString();
}

export function replayFromUrl(currentUrl: string): ReplayDecodeResult | undefined {
  const encoded = new URL(currentUrl).searchParams.get("replay");
  return encoded ? decodeReplay(encoded) : undefined;
}

export function applyReplayEra(state: IslandCrossingState, payload: ReplayPayload): IslandCrossingState {
  let next = state;
  for (const action of payload.actions.filter((item) => item.era === state.era)) {
    const result = placeFood(next, action);
    if (!result.ok) throw new Error(`Replay era ${state.era} is invalid: ${result.reason}`);
    next = result.state;
  }
  return next;
}

export function createReplayGame(payload: ReplayPayload): IslandCrossingState {
  return applyReplayEra(createGame(payload.seed), payload);
}

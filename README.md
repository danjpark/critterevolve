# Critter Evolve: Island Crossing

A browser-first evolutionary puzzle. The player cannot edit creature traits; they place food to create ecological pressure, then deterministic natural selection decides whether a population becomes amphibious enough to colonize a second island.

## Run locally

Requires Node.js 20 or newer.

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Use `pnpm test` for deterministic scenario tests and `pnpm build` for the static production bundle in `dist/`.

Play the public build at **https://danjpark.github.io/critterevolve/**.

## Mission rules

- Place up to three food patches per era.
- Food persists for two eras.
- Run ten generations per era as 240 visible deterministic ticks, for at most five eras.
- Pause at any moment, advance one tick at a time, or watch at 1×, 4×, or 12× speed.
- Establish at least 20 critters on the target island, record five local births, and sustain the population for three generations.
- Swimming ability is inherited and mutable. Better swimmers pay a terrestrial-efficiency cost.

The `D` key toggles deterministic simulation diagnostics. Playback speed changes only presentation; the run ID and exported run data capture the seed, level version, and every player intervention for exact reproduction.

## Architecture

```text
src/sim     pure deterministic TypeScript simulation
src/game    Island Crossing rules, level, balance, replay data
src/render  replaceable PixiJS presentation
src/ui      mission summaries and results
src/app     React orchestration and responsive styling
```

The simulation has no DOM, React, or PixiJS dependencies. Rendering reads simulation state; it never decides outcomes.

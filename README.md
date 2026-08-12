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
- Run 240 real simulation ticks per era, for at most five eras.
- Pause at any moment, advance exactly one tick, or watch at 1x, 4x, or 12x speed.
- Establish at least 20 critters on the target island, record five local births, and sustain the population for 48 ticks.
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

## Tick model v0.3

Critter Evolve uses the same central idea as a cellular automaton: state `N` is the complete input to one deterministic update, which produces state `N + 1`. A surviving critter keeps its ID, genome, position, heading, energy, age, and current food target. Its position can change only by the movement calculated for that one tick. A birth gets a new ID and a `parentId`; the renderer uses that relationship only to animate the child appearing near its parent.

The play button repeatedly calls the same one-tick function as the Step button. Playback speed only changes how quickly those states are shown. The renderer interpolates between two real states for smoothness but never fabricates intermediate simulation ticks or substitutes a different critter at the next position.

### State carried by each critter

- `id` and optional `parentId`
- position `(x, y)` and `heading`
- inherited `aquaticMovement` trait `a` in `[0.01, 0.99]`
- `energy`, `age`, and reproduction cooldown
- current habitat and optional food target
- last completed action, for presentation only

Food patches also carry a persistent resource level. The seeded random-number-generator state is part of the simulation state, so the same seed and intervention history replay exactly.

### Fixed update order

Every tick runs this order in `src/sim/simulation.ts`:

1. Add existing patches, remove expired patches, and regrow active food.
2. Visit persistent critters in stable order.
3. Sense and score active food patches; keep the current target for up to 12 ticks unless it disappears or empties.
4. Steer toward that target, or perform a seeded random wander when no target is worthwhile.
5. Move one bounded step, update habitat, and pay metabolism plus movement energy.
6. Eat if the critter is within 15 world units of its target.
7. Age, reduce reproduction cooldown, and reproduce if all requirements are met.
8. Remove critters with no energy or a maximum age of 960 ticks.
9. Add newborns, then calculate population, trait, crossing, birth, and persistence metrics.

Newborns never act in their birth tick. This order is a versioned gameplay rule: changing it can change a replay's outcome.

### Equations

Let `clamp(x, lo, hi)` restrict `x` to that range, `a` be aquatic movement, `h` be habitat, `d` be distance traveled, and `v` be a food patch's value.

Movement efficiency:

```text
land(a)       = clamp(1 - 0.58a, 0.25, 1)
waterBase(a)  = 0.02 + 2.2a
shallow(a)    = clamp(0.30 + 0.82 * waterBase(a), 0.18, 1.25)
deep(a)       = clamp(waterBase(a), 0.08, 1.35)
distance      = 3.2 * movementEfficiency(a, h)
```

This is the core tradeoff: a larger `a` makes a critter faster and more effective at feeding in water, but slower on land.

Tick energy cost:

```text
metabolism = 0.012
landMove   = d * 0.0035 / max(0.20, efficiency^1.5)
waterMove  = d * waterCost(h) * clamp(1.35 - a, 0.30, 1.30)
             / max(0.08, efficiency^1.5)
waterCost(shallow) = 0.008
waterCost(deep)    = 0.012
energyNext = energy - metabolism - moveCost
```

Food capacity, regrowth, and target score:

```text
capacity       = 22v
levelNext      = min(capacity, level + 0.03 * capacity)
feedingEff     = clamp(movementEfficiency(a, h)^2, 0.05, 1)
intake         = min(level, 0.25 * feedingEff)
energyFromFood = 3 * intake, capped at total energy 16

score = (level + 0.12 * capacity) * v * (0.22 + access)
        / (34 + distanceToPatch)
```

`access` uses movement efficiency in ordinary habitats. Crossing to the target island also uses a logistic swimming-confidence curve centered near `a = 0.38`, so distant rewards become attractive primarily to capable swimmers.

Reproduction occurs after eating when energy is at least `12.5`, age is at least `36`, and cooldown is zero. The parent pays `4.4` energy and receives a 72-tick cooldown; the child starts with `3.2` energy near the parent. On each birth, mutation has probability `0.42`; when it occurs, a seeded normal offset with standard deviation `0.035` is added to `a` and clamped to the valid range.

### Action scope

The current causal action set is **sense, steer/wander, move, eat, reproduce, and die**. Hunting, combat, cooperation, mating choice, and memory are not implemented in Island Crossing v0.3. They can be added later as explicit decision intents and resolution stages, but they should not be hidden inside rendering or silently alter this tick contract.

### Determinism checks

The automated tests assert that identical seeds replay exactly, surviving IDs persist, movement is bounded to one step per tick, food becomes energy and is depleted, births create a new child ID, starvation causes death, aquatic pressure changes selection, and the 240 one-step calls in an era equal the one-call headless result.

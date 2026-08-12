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
- Establish at least 55 critters on the target island, record 12 local births, and sustain the population for 96 ticks.
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

## Tick model v0.5

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

The current causal action set is **sense, steer/wander, move, eat, reproduce, and die**. Hunting, combat, cooperation, mating choice, and memory are not implemented in Island Crossing v0.5. They can be added later as explicit decision intents and resolution stages, but they should not be hidden inside rendering or silently alter this tick contract.

### Determinism checks

The automated tests assert that identical seeds replay exactly, surviving IDs persist, movement is bounded to one step per tick, food becomes energy and is depleted, births create a new child ID, starvation causes death, aquatic pressure changes selection, and the 240 one-step calls in an era equal the one-call headless result.

## Following one critter

Click any critter to pause and open the **Critter lens**. The selected individual receives a gold ring and a trail containing up to 40 committed positions. The panel shows its persistent ID, parent, age, trait, energy, current target, and latest action. Its tick ledger exposes the actual movement equation and every energy addition or subtraction, including metabolism, terrain-dependent movement, eating, and reproduction.

The ledger is stored by the simulation in `lastTickRecords`; it is not reverse-engineered by the UI. This keeps debugging truthful and makes the same information available to future clients or replay tools.

## v0.4 balance baseline

The balance suite plays five complete eras for ten fixed seeds. These are test strategies, not a required solution sequence.

| Strategy | Wins | Mean swimming | Mean land performance | Mean final target population |
| --- | ---: | ---: | ---: | ---: |
| Food kept on land | 0 / 10 | 16.7% | 90.3% | 8.3 |
| Food held at shoreline | 0 / 10 | 19.3% | 88.8% | 7.8 |
| Food placed immediately offshore | 0 / 10 | 23.5% | 86.3% | 10.4 |
| Food moved gradually across the channel | 10 / 10 | 24.9% | 85.6% | 146.3 |
| Uniform random placement | 5 / 10 | 21.2% | 87.7% | 47.0 |

The intended strategy therefore doubles the benchmark win rate and establishes roughly three times the far-island population of random play. Immediate offshore pressure creates the largest specialization among the three stationary controls, but its smaller population and failed colonies demonstrate that maximum aquatic pressure is not itself the solution.

## Public playtest

Play at **https://danjpark.github.io/critterevolve/**. A useful test session is:

1. Play once using your first instinct.
2. Retry and gradually move food from shore to deep water to the far island.
3. During playback, select a critter and step through several ticks to check whether its choices make sense.
4. At the result screen, use **Copy replay link** so someone else can rerun the experiment, or attach **Copy run data** to a [Critter Evolve playtest report](https://github.com/danjpark/critterevolve/issues/new).

Useful feedback includes where you expected a critter to move, which equation or action surprised you, the run ID, whether you won, and what you wanted to try next.

## Shareable deterministic replays

Version 0.5 replay links encode only the causal inputs required to reproduce a run:

```text
format version
game and level versions
seed
food placement era and coordinates
```

Opening a replay link restores each era's food automatically and locks editing. Playback speed, pause, Step tick, and the Critter lens remain available so another player can investigate the outcome. The simulation is recomputed from tick zero; positions, metrics, and results are not embedded in the URL.

Replay payloads are URL-safe, limited to the mission's maximum 15 actions, and validated for version compatibility, map boundaries, per-era budgets, and overlapping placements. The deterministic test suite proves that encoding and replaying a complete five-era strategy recreates the original final state exactly.

## Causal era summaries

Each era report converts raw metric changes into one deterministic interpretation and a suggested next experiment. The rule order highlights:

1. Far-island births as colony formation.
2. Population losses of 12% or more as excessive ecological pressure.
3. Crossings without births as exploration rather than establishment.
4. Swimming increases of at least one percentage point as inherited selection, including the land-performance cost.
5. Water-activity increases of at least eight percentage points as behavioral exploration before genetic change.
6. Otherwise, a weak-selection explanation.

These messages do not affect the simulation. They are derived after an era from the same before/after metrics already shown in the report, making their reasoning deterministic and testable.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { balance } from "../game/config";
import {
  advanceEraTick,
  beginEraSimulation,
  beginNextEra,
  createGame,
  placeFood,
  remainingPlacements,
  runId,
  type IslandCrossingState,
} from "../game/islandCrossing";
import {
  applyReplayEra,
  createReplayGame,
  replayFromUrl,
  type ReplayPayload,
} from "../game/replay";
import { PixiWorld } from "../render/PixiWorld";
import type { WorldTransition } from "../render/PixiWorld";
import type { TrailPoint } from "../render/PixiWorld";
import type { Point } from "../sim/types";
import { EraSummary } from "../ui/EraSummary";
import { Metric } from "../ui/Metric";
import { ResultScreen } from "../ui/ResultScreen";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const TICK_DURATION_MS = 120;

interface PlaybackTransition extends WorldTransition {
  toGame: IslandCrossingState;
}

function freshSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] || 481021;
}

export function App() {
  const replayLoad = useMemo(() => replayFromUrl(window.location.href), []);
  const loadedReplay = replayLoad?.ok ? replayLoad.payload : undefined;
  const [replay, setReplay] = useState<ReplayPayload | undefined>(loadedReplay);
  const [game, setGame] = useState<IslandCrossingState>(() => loadedReplay ? createReplayGame(loadedReplay) : createGame());
  const [briefing, setBriefing] = useState(true);
  const [debug, setDebug] = useState(false);
  const [notice, setNotice] = useState<string | null>(replayLoad && !replayLoad.ok ? replayLoad.reason : null);
  const [transition, setTransition] = useState<PlaybackTransition>();
  const [transitionProgress, setTransitionProgress] = useState(0);
  const progressRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedCritterId, setSelectedCritterId] = useState<number>();
  const [selectedTrail, setSelectedTrail] = useState<TrailPoint[]>([]);
  const metrics = game.sim.metrics;
  const remaining = remainingPlacements(game);
  const simulating = game.phase === "simulating" || Boolean(transition);
  const placing = game.phase === "player" && remaining > 0 && !briefing && !replay;
  const colonyProgress = Math.min(100, (metrics.targetPopulation / balance.targetPopulationRequired) * 100);
  const visibleTick = transition ? transition.to.tick : game.sim.tick;
  const visibleEraTick = game.eraTick + (transition ? 1 : 0);
  const eraProgress = Math.min(100, (visibleEraTick / balance.ticksPerEra) * 100);
  const visibleSimulation = transition?.to ?? game.sim;
  const selectedCritter = selectedCritterId === undefined
    ? undefined
    : visibleSimulation.critters.find((critter) => critter.id === selectedCritterId);
  const selectedRecord = selectedCritterId === undefined
    ? undefined
    : visibleSimulation.lastTickRecords[selectedCritterId];

  const selectCritter = useCallback((critterId: number) => {
    const simulation = transition?.to ?? game.sim;
    const critter = simulation.critters.find((item) => item.id === critterId);
    if (!critter) return;
    setSelectedCritterId(critterId);
    setSelectedTrail([{ tick: simulation.tick, x: critter.x, y: critter.y }]);
    setPaused(true);
  }, [game.sim, transition]);

  useEffect(() => {
    if (selectedCritterId === undefined) return;
    const critter = game.sim.critters.find((item) => item.id === selectedCritterId);
    if (!critter) return;
    setSelectedTrail((trail) => {
      if (trail.at(-1)?.tick === game.sim.tick) return trail;
      return [...trail, { tick: game.sim.tick, x: critter.x, y: critter.y }].slice(-40);
    });
  }, [game.sim, selectedCritterId]);

  const observation = useMemo(() => {
    const observed = transition?.to ?? (game.sim.tick > 0 ? game.sim : undefined);
    if (!observed) return undefined;
    const before = transition?.from.metrics ?? observed.metrics;
    const after = observed.metrics;
    const events = observed.lastTickEvents;
    return {
      moved: events.moved,
      ate: events.ate,
      waterEntries: events.waterEntries,
      crossings: events.crossings,
      localBirths: events.targetBirths,
      births: events.births,
      deaths: events.deaths,
      swimmingDelta: after.aquaticMean - before.aquaticMean,
    };
  }, [game.sim, transition]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "d" && !event.ctrlKey && !event.metaKey) setDebug((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Queue one seeded simulation tick at a time. Playback speed changes only how
  // quickly fixed ticks are displayed, never simulation outcomes or RNG order.
  useEffect(() => {
    if (game.phase !== "simulating" || paused || transition) return;
    const toGame = advanceEraTick(game);
    progressRef.current = 0;
    setTransitionProgress(0);
    setTransition({ from: game.sim, to: toGame.sim, toGame });
  }, [game, paused, transition]);

  useEffect(() => {
    if (!transition || paused) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    const animate = (time: number) => {
      const elapsed = time - previousTime;
      previousTime = time;
      const nextProgress = Math.min(
        1,
        progressRef.current + elapsed / (TICK_DURATION_MS / playbackSpeed),
      );
      progressRef.current = nextProgress;
      setTransitionProgress(nextProgress);
      if (nextProgress >= 1) {
        setGame(transition.toGame);
        setTransition(undefined);
        return;
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [transition, paused, playbackSpeed]);

  const latestSummary = game.summaries.at(-1);
  const eraDots = useMemo(
    () => Array.from({ length: balance.maxEras }, (_, index) => index + 1),
    [],
  );

  function handlePlace(point: Point) {
    const result = placeFood(game, point);
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    setGame(result.state);
    setNotice(`${result.state.interventions.at(-1)!.habitat === "target" ? "Far-shore" : result.state.interventions.at(-1)!.habitat} food placed`);
  }

  function handleAdvance() {
    if (game.phase !== "player") return;
    setPaused(false);
    setGame(beginEraSimulation(game));
    setNotice("Simulation live — watch who reaches the food.");
  }

  function stepOneTick() {
    setPaused(true);
    if (transition) {
      setGame(transition.toGame);
      setTransition(undefined);
      progressRef.current = 0;
      setTransitionProgress(0);
      return;
    }
    if (game.phase !== "simulating") return;
    setGame(advanceEraTick(game));
  }

  function togglePlayback() {
    if (paused) {
      setPaused(false);
      return;
    }
    setPaused(true);
    if (transition) {
      setGame(transition.toGame);
      setTransition(undefined);
      progressRef.current = 0;
      setTransitionProgress(0);
    }
  }

  function restart() {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("replay");
    window.history.replaceState(null, "", cleanUrl);
    setReplay(undefined);
    setGame(createGame(freshSeed()));
    setTransition(undefined);
    progressRef.current = 0;
    setTransitionProgress(0);
    setPaused(false);
    setBriefing(false);
    setSelectedCritterId(undefined);
    setSelectedTrail([]);
    setNotice("A new island, a new lineage.");
  }

  function continueEra() {
    let next = beginNextEra(game);
    if (replay) next = applyReplayEra(next, replay);
    setGame(next);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
          <div>
            <span className="brand">Critter Evolve</span>
            <span className="mission-name">Island Crossing</span>
          </div>
        </div>
        <div className="era-track" aria-label={`Era ${game.era} of ${balance.maxEras}`}>
          <span>ERA</span>
          {eraDots.map((era) => (
            <i key={era} className={era < game.era ? "is-complete" : era === game.era ? "is-current" : ""}>{era}</i>
          ))}
        </div>
        <div className="header-meta">
          <button className="icon-button" onClick={() => setDebug((value) => !value)} aria-label="Toggle diagnostics">D</button>
          <span>SEED {game.seed}</span>
          {replay && <span className="replay-badge">REPLAY</span>}
          <span>RUN {runId(game)}</span>
        </div>
      </header>

      <section className="mission-strip">
        <div>
          <span className="eyebrow">{replay ? "Shared experiment" : "Your objective"}</span>
          <p>{replay ? "Recorded food placements are locked in. Watch the same causal run unfold." : "Establish a viable colony on the far island before the fifth era ends."}</p>
        </div>
        <div className="colony-progress">
          <div className="progress-copy"><span>Colony</span><strong>{metrics.targetPopulation} / {balance.targetPopulationRequired}</strong></div>
          <div className="progress-track"><i style={{ width: `${colonyProgress}%` }} /></div>
          <small>{metrics.targetBirths} / {balance.targetBirthsRequired} local births</small>
        </div>
      </section>

      <section className="game-layout">
        <aside className="sidebar sidebar--left">
          <div className="panel-heading">
            <span className="eyebrow">Living population</span>
            <span className="live-dot">LIVE</span>
          </div>
          <Metric label="Population" value={String(metrics.population)} detail="one evolving species" accent="coral" />
          <Metric label="Swimming" value={percent(metrics.aquaticMean)} detail={`range ${percent(metrics.aquaticMin)}–${percent(metrics.aquaticMax)}`} />
          <Metric label="Land performance" value={percent(metrics.landPerformance)} detail="falls as swimming rises" accent="gold" />
          <div className="trait-balance">
            <span>LAND</span><span>AMPHIBIOUS</span><span>WATER</span>
            <div className="trait-track"><i style={{ left: `${metrics.aquaticMean * 100}%` }} /></div>
          </div>
          <div className="observation-list">
            <div><span>Water activity</span><strong>{percent(metrics.waterActivity)}</strong></div>
            <div><span>Farthest offshore</span><strong>{Math.round(metrics.farthestOffshore)}m</strong></div>
            <div><span>Far-shore critters</span><strong>{metrics.targetPopulation}</strong></div>
          </div>
          <div className="natural-law">
            <span aria-hidden="true">⌁</span>
            <p><strong>You shape the pressure.</strong> Their descendants carry the answer.</p>
          </div>
        </aside>

        <div className={`world-frame ${simulating ? "is-simulating" : ""}`}>
          <PixiWorld
            state={game}
            onPlaceFood={handlePlace}
            placementEnabled={placing}
            transition={transition}
            transitionProgress={transitionProgress}
            selectedCritterId={selectedCritterId}
            selectedTrail={selectedTrail}
            onSelectCritter={selectCritter}
          />
          <div className="map-legend">
            <span><i className="legend-land" /> Land</span>
            <span><i className="legend-shallow" /> Shallows</span>
            <span><i className="legend-deep" /> Deep water</span>
          </div>
          {placing && <div className="placement-hint"><i /> Click anywhere to place food</div>}
          {simulating && (
            <div className="live-sim-bar">
              <div><i /><strong>LIVE</strong><span>ERA TICK {Math.min(visibleEraTick, balance.ticksPerEra)} / {balance.ticksPerEra}</span><span>GLOBAL {visibleTick}</span></div>
              <div className="live-sim-track"><i style={{ width: `${eraProgress}%` }} /></div>
            </div>
          )}
          {notice && <div className="toast" role="status">{notice}</div>}
        </div>

        <aside className="sidebar sidebar--right">
          <div className="panel-heading">
            <span className="eyebrow">{simulating ? "Simulation playback" : replay ? "Replay plan" : "Ecological tools"}</span>
            <span className="tool-count">{simulating ? `${Math.round(eraProgress)}%` : replay ? `ERA ${game.era}` : `${remaining} LEFT`}</span>
          </div>
          {selectedCritterId !== undefined && (
            <section className="critter-inspector" aria-label={`Inspecting critter ${selectedCritterId}`}>
              <div className="inspector-heading">
                <div><span className="eyebrow">Critter lens</span><strong>#{selectedCritterId}</strong></div>
                <button onClick={() => { setSelectedCritterId(undefined); setSelectedTrail([]); }} aria-label="Close critter inspector">x</button>
              </div>
              {selectedCritter ? (
                <>
                  <div className="inspector-grid">
                    <span>Action</span><strong>{selectedRecord?.action ?? selectedCritter.lastAction}</strong>
                    <span>Swimming</span><strong>{percent(selectedCritter.genome.aquaticMovement)}</strong>
                    <span>Energy</span><strong>{selectedCritter.energy.toFixed(2)} / {balance.maximumEnergy}</strong>
                    <span>Age</span><strong>{selectedCritter.age} ticks</strong>
                    <span>Parent</span><strong>{selectedCritter.parentId ? `#${selectedCritter.parentId}` : "founder"}</strong>
                    <span>Target</span><strong>{selectedCritter.targetFoodId?.replace(/^player-\d+-\d+-/, "food @ ") ?? "none"}</strong>
                  </div>
                  {selectedRecord ? (
                    <div className="tick-equation">
                      <span>Tick {selectedRecord.tick} movement</span>
                      <code>{balance.baseMovementPerTick.toFixed(1)} x {selectedRecord.movementEfficiency.toFixed(2)} = {selectedRecord.plannedDistance.toFixed(2)} units{Math.abs(selectedRecord.plannedDistance - selectedRecord.actualDistance) > 0.01 ? ` (${selectedRecord.actualDistance.toFixed(2)} after boundary)` : ""}</code>
                      <span>Energy ledger</span>
                      <code>{selectedRecord.energyBefore.toFixed(2)} - {selectedRecord.metabolicCost.toFixed(3)} metabolism - {selectedRecord.movementCost.toFixed(3)} move + {selectedRecord.foodEnergy.toFixed(2)} food{selectedRecord.reproduced ? ` - ${balance.reproductionCost.toFixed(1)} birth` : ""} = {selectedRecord.energyAfter.toFixed(2)}</code>
                    </div>
                  ) : <p>Select it again after the first tick to see its calculation.</p>}
                  <small>Gold trail: last {selectedTrail.length} recorded positions</small>
                </>
              ) : (
                <p>This critter died on tick {selectedRecord?.tick ?? visibleTick}. Its final action was {selectedRecord?.action ?? "death"}.</p>
              )}
            </section>
          )}
          {simulating ? (
            <>
              <div className="playback-status">
                <span>Era tick</span><strong>{Math.min(visibleEraTick, balance.ticksPerEra)} / {balance.ticksPerEra}</strong>
                <span>Global tick</span><strong>{visibleTick}</strong>
              </div>
              <div className="playback-controls">
                <button onClick={togglePlayback} aria-label={paused ? "Resume simulation" : "Pause simulation"}>
                  {paused ? "▶" : "Ⅱ"}<span>{paused ? "Play" : "Pause"}</span>
                </button>
                <button onClick={stepOneTick} aria-label="Advance one simulation tick">›<span>Step tick</span></button>
              </div>
              <div className="speed-control" aria-label="Playback speed">
                {[1, 4, 12].map((speed) => (
                  <button key={speed} className={playbackSpeed === speed ? "is-active" : ""} onClick={() => setPlaybackSpeed(speed)}>{speed}×</button>
                ))}
              </div>
              <div className="phase-divider" />
              <div className="generation-events">
                <span className="eyebrow">What is happening</span>
                {observation ? (
                  <>
                    <div><span>Moved</span><strong>{observation.moved}</strong></div>
                    <div className={observation.ate > 0 ? "is-positive" : ""}><span>Ate</span><strong>{observation.ate}</strong></div>
                    <div className={observation.waterEntries > 0 ? "is-positive" : ""}><span>Entered water</span><strong>{observation.waterEntries}</strong></div>
                    <div className={observation.crossings > 0 ? "is-positive" : ""}><span>New crossings</span><strong>+{observation.crossings}</strong></div>
                    <div className={observation.localBirths > 0 ? "is-positive" : ""}><span>Far-shore births</span><strong>+{observation.localBirths}</strong></div>
                    <div className={observation.births > 0 ? "is-positive" : ""}><span>All births</span><strong>+{observation.births}</strong></div>
                    <div className={observation.deaths > 0 ? "is-negative" : ""}><span>Deaths</span><strong>−{observation.deaths}</strong></div>
                    <div className={observation.swimmingDelta >= 0 ? "is-positive" : "is-negative"}><span>Trait shift</span><strong>{observation.swimmingDelta >= 0 ? "+" : ""}{(observation.swimmingDelta * 100).toFixed(2)}%</strong></div>
                  </>
                ) : <p>Preparing the next deterministic tick…</p>}
              </div>
              <p className="advance-help">Click a critter to pause, inspect its equation, and follow its gold trail. Orange favors land; blue favors water.</p>
            </>
          ) : (
            <>
              {replay ? (
                <>
                  <div className="tool-card replay-card">
                    <div className="replay-icon">R</div>
                    <div><strong>Recorded food</strong><span>{replay.actions.filter((action) => action.era === game.era).length} placements restored for this era.</span></div>
                  </div>
                  <p className="tool-help">Replay mode locks player choices while preserving pause, speed, Step tick, and the Critter lens.</p>
                </>
              ) : (
                <>
                  <div className={`tool-card ${placing ? "is-active" : ""}`}>
                    <div className="food-icon"><i /></div>
                    <div><strong>Place food</strong><span>Move resources. Create selection pressure.</span></div>
                  </div>
                  <p className="tool-help">Food lasts for two eras. Place it on land, at the shore, or offshore—then watch who reaches it.</p>
                  <div className="patch-pips" aria-label={`${remaining} food patches remaining`}>
                    {Array.from({ length: balance.foodPatchesPerEra }, (_, index) => <i key={index} className={index < remaining ? "is-full" : ""} />)}
                  </div>
                </>
              )}
              <div className="phase-divider" />
              <button className="button button--advance" onClick={handleAdvance} disabled={briefing || game.phase !== "player"}>
                <span>{`Run era ${game.era}`}</span>
                <i aria-hidden="true">→</i>
              </button>
              <p className="advance-help">Runs {balance.ticksPerEra} real simulation ticks. Every position persists into the next tick.</p>
            </>
          )}
        </aside>
      </section>

      <footer>
        <span>One species · two islands · every tick visible</span>
        <span>Press <kbd>D</kbd> for diagnostics</span>
      </footer>

      {briefing && (
        <div className="overlay overlay--briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
          <div className="briefing-card">
            <span className="eyebrow">{replay ? `Shared run · Seed ${replay.seed}` : "Mission 01 · Five eras"}</span>
            <h1 id="briefing-title">{replay ? <>Replay the experiment.<br /><em>Tick by exact tick.</em></> : <>Teach them to cross.<br /><em>Without touching a trait.</em></>}</h1>
            <p>{replay ? `This link contains ${replay.actions.length} recorded food placements. The seed, decisions, simulation order, and random-number stream will reproduce the original outcome.` : "A small population is stranded on one island. Place food to shape where they forage, then watch every tick. Better swimmers will eat, survive, and pass on their advantage—but too much aquatic adaptation makes life on land harder."}</p>
            <div className="briefing-rules">
              <span><b>01</b> {replay ? "Restore every placement" : "Place 3 food patches"}</span>
              <span><b>02</b> Watch, pause, and step</span>
              <span><b>03</b> {replay ? "Verify the outcome" : "Adapt, cross, establish"}</span>
            </div>
            <button className="button button--primary button--wide" onClick={() => setBriefing(false)}>{replay ? "Begin replay" : "Begin the experiment"}</button>
          </div>
        </div>
      )}

      {game.phase === "summary" && latestSummary && <EraSummary summary={latestSummary} onContinue={continueEra} />}
      {(game.phase === "won" || game.phase === "lost") && <ResultScreen state={game} onRestart={restart} />}

      {debug && (
        <div className="debug-panel">
          <strong>SIM DIAGNOSTICS</strong>
          <span>seed {game.seed}</span><span>era {game.era} / tick {visibleTick}</span>
          <span>lineage depth {game.sim.generation}</span><span>population {metrics.population}</span>
          <span>aquatic μ {metrics.aquaticMean.toFixed(4)}</span><span>median {metrics.aquaticMedian.toFixed(4)}</span>
          <span>min/max {metrics.aquaticMin.toFixed(3)} / {metrics.aquaticMax.toFixed(3)}</span>
          <span>land eff {metrics.landPerformance.toFixed(4)}</span><span>water use {metrics.waterActivity.toFixed(4)}</span>
          <span>target pop {metrics.targetPopulation}</span><span>target births {metrics.targetBirths}</span>
          <span>persistence {metrics.targetPersistenceTicks} ticks</span><span>food actions {game.interventions.length}</span>
          <span>rng {game.sim.rngState}</span><span>1 decision / tick / critter</span>
        </div>
      )}
    </main>
  );
}

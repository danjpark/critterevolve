import { useEffect, useMemo, useState } from "react";
import { balance } from "../game/config";
import {
  advanceEra,
  beginNextEra,
  createGame,
  placeFood,
  remainingPlacements,
  runId,
  type IslandCrossingState,
} from "../game/islandCrossing";
import { PixiWorld } from "../render/PixiWorld";
import type { Point } from "../sim/types";
import { EraSummary } from "../ui/EraSummary";
import { Metric } from "../ui/Metric";
import { ResultScreen } from "../ui/ResultScreen";

const percent = (value: number) => `${Math.round(value * 100)}%`;

function freshSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] || 481021;
}

export function App() {
  const [game, setGame] = useState<IslandCrossingState>(() => createGame());
  const [briefing, setBriefing] = useState(true);
  const [debug, setDebug] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const metrics = game.sim.metrics;
  const remaining = remainingPlacements(game);
  const placing = game.phase === "player" && remaining > 0 && !briefing && !advancing;
  const colonyProgress = Math.min(100, (metrics.targetPopulation / balance.targetPopulationRequired) * 100);

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
    if (advancing || game.phase !== "player") return;
    setAdvancing(true);
    window.setTimeout(() => {
      setGame((current) => advanceEra(current));
      setAdvancing(false);
    }, 420);
  }

  function restart() {
    setGame(createGame(freshSeed()));
    setBriefing(false);
    setNotice("A new island, a new lineage.");
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
          <span>RUN {runId(game)}</span>
        </div>
      </header>

      <section className="mission-strip">
        <div>
          <span className="eyebrow">Your objective</span>
          <p>Establish a viable colony on the far island before the fifth era ends.</p>
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

        <div className={`world-frame ${advancing ? "is-advancing" : ""}`}>
          <PixiWorld state={game} onPlaceFood={handlePlace} placementEnabled={placing} />
          <div className="map-legend">
            <span><i className="legend-land" /> Land</span>
            <span><i className="legend-shallow" /> Shallows</span>
            <span><i className="legend-deep" /> Deep water</span>
          </div>
          {placing && <div className="placement-hint"><i /> Click anywhere to place food</div>}
          {advancing && <div className="selection-wave"><i /><span>Generations passing…</span></div>}
          {notice && <div className="toast" role="status">{notice}</div>}
        </div>

        <aside className="sidebar sidebar--right">
          <div className="panel-heading">
            <span className="eyebrow">Ecological tools</span>
            <span className="tool-count">{remaining} LEFT</span>
          </div>
          <div className={`tool-card ${placing ? "is-active" : ""}`}>
            <div className="food-icon"><i /></div>
            <div><strong>Place food</strong><span>Move resources. Create selection pressure.</span></div>
          </div>
          <p className="tool-help">Food lasts for two eras. Place it on land, at the shore, or offshore—then watch who reaches it.</p>
          <div className="patch-pips" aria-label={`${remaining} food patches remaining`}>
            {Array.from({ length: balance.foodPatchesPerEra }, (_, index) => <i key={index} className={index < remaining ? "is-full" : ""} />)}
          </div>
          <div className="phase-divider" />
          <button className="button button--advance" onClick={handleAdvance} disabled={advancing || briefing}>
            <span>{advancing ? "Selection in progress" : `Advance era ${game.era}`}</span>
            <i aria-hidden="true">→</i>
          </button>
          <p className="advance-help">Advances {balance.generationsPerEra} generations. Unused food placements are lost.</p>
        </aside>
      </section>

      <footer>
        <span>One species · two islands · no direct control</span>
        <span>Press <kbd>D</kbd> for diagnostics</span>
      </footer>

      {briefing && (
        <div className="overlay overlay--briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
          <div className="briefing-card">
            <span className="eyebrow">Mission 01 · Five eras</span>
            <h1 id="briefing-title">Teach them to cross.<br /><em>Without touching a trait.</em></h1>
            <p>A small population is stranded on one island. Place food to shape where they forage. Better swimmers will eat, survive, and pass on their advantage—but too much aquatic adaptation makes life on land harder.</p>
            <div className="briefing-rules">
              <span><b>01</b> Place 3 food patches</span>
              <span><b>02</b> Advance an era</span>
              <span><b>03</b> Adapt, cross, establish</span>
            </div>
            <button className="button button--primary button--wide" onClick={() => setBriefing(false)}>Begin the experiment</button>
          </div>
        </div>
      )}

      {game.phase === "summary" && latestSummary && <EraSummary summary={latestSummary} onContinue={() => setGame(beginNextEra(game))} />}
      {(game.phase === "won" || game.phase === "lost") && <ResultScreen state={game} onRestart={restart} />}

      {debug && (
        <div className="debug-panel">
          <strong>SIM DIAGNOSTICS</strong>
          <span>seed {game.seed}</span><span>era {game.era} / tick {game.sim.tick}</span>
          <span>generation {game.sim.generation}</span><span>population {metrics.population}</span>
          <span>aquatic μ {metrics.aquaticMean.toFixed(4)}</span><span>median {metrics.aquaticMedian.toFixed(4)}</span>
          <span>min/max {metrics.aquaticMin.toFixed(3)} / {metrics.aquaticMax.toFixed(3)}</span>
          <span>land eff {metrics.landPerformance.toFixed(4)}</span><span>water use {metrics.waterActivity.toFixed(4)}</span>
          <span>target pop {metrics.targetPopulation}</span><span>target births {metrics.targetBirths}</span>
          <span>persistence {metrics.targetPersistenceGenerations} gen</span><span>food actions {game.interventions.length}</span>
          <span>rng {game.sim.rngState}</span><span>24 deterministic ticks/gen</span>
        </div>
      )}
    </main>
  );
}

import { balance } from "../game/config";
import type { IslandCrossingState } from "../game/islandCrossing";
import { exportRun, runId } from "../game/islandCrossing";

interface ResultScreenProps {
  state: IslandCrossingState;
  onRestart(): void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function ResultScreen({ state, onRestart }: ResultScreenProps) {
  const won = state.phase === "won";
  const start = state.summaries[0]?.before ?? state.sim.metrics;
  const final = state.sim.metrics;

  async function copyRun() {
    await navigator.clipboard.writeText(exportRun(state));
  }

  return (
    <div className={`overlay overlay--result ${won ? "is-win" : "is-loss"}`} role="dialog" aria-modal="true">
      <div className="result-card">
        <span className="result-mark" aria-hidden="true">{won ? "✦" : "≈"}</span>
        <span className="eyebrow">Era {state.era} / {balance.maxEras}</span>
        <h2>{won ? "Island colonized" : "Colonization failed"}</h2>
        <p className="result-reason">{state.resultReason}</p>
        <div className="result-stats">
          <div><span>Swimming</span><strong>{percent(start.aquaticMean)} → {percent(final.aquaticMean)}</strong></div>
          <div><span>Land performance</span><strong>{percent(final.landPerformance)}</strong></div>
          <div><span>Target population</span><strong>{final.targetPopulation}</strong></div>
          <div><span>Local births</span><strong>{final.targetBirths}</strong></div>
        </div>
        <div className="result-actions">
          <button className="button button--primary" onClick={onRestart}>Try a new island</button>
          <button className="button button--ghost" onClick={() => void copyRun()}>Copy run data</button>
        </div>
        <span className="run-id">RUN {runId(state)}</span>
      </div>
    </div>
  );
}

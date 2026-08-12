import type { EraSummary as Summary } from "../game/islandCrossing";

interface EraSummaryProps {
  summary: Summary;
  onContinue(): void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const signed = (before: number, after: number, formatter: (value: number) => string) => (
  <>
    <span>{formatter(before)}</span>
    <span className="summary-arrow">→</span>
    <strong>{formatter(after)}</strong>
  </>
);

function roman(value: number): string {
  return ["I", "II", "III", "IV", "V"][value - 1] ?? String(value);
}

export function EraSummary({ summary, onContinue }: EraSummaryProps) {
  const { before, after } = summary;
  return (
    <div className="overlay overlay--summary" role="dialog" aria-modal="true" aria-labelledby="summary-title">
      <div className="summary-card">
        <span className="eyebrow">Natural selection report</span>
        <h2 id="summary-title">Era {roman(summary.era)} complete</h2>
        <p className="summary-lead">The population answered the pressure you created.</p>
        <div className="summary-grid">
          <div><span>Population</span>{signed(before.population, after.population, String)}</div>
          <div><span>Swimming</span>{signed(before.aquaticMean, after.aquaticMean, percent)}</div>
          <div><span>Land performance</span>{signed(before.landPerformance, after.landPerformance, percent)}</div>
          <div><span>Water activity</span>{signed(before.waterActivity, after.waterActivity, percent)}</div>
          <div><span>Farthest offshore</span>{signed(before.farthestOffshore, after.farthestOffshore, (v) => `${Math.round(v)}m`)}</div>
          <div><span>Target population</span>{signed(before.targetPopulation, after.targetPopulation, String)}</div>
        </div>
        <button className="button button--primary button--wide" onClick={onContinue}>Plan the next era</button>
      </div>
    </div>
  );
}

import { describe, expect, it } from "vitest";
import { explainEra } from "../src/game/eraInsight";
import type { EraSummary } from "../src/game/islandCrossing";
import type { SimulationMetrics } from "../src/sim/types";

const baseline: SimulationMetrics = {
  population: 100,
  aquaticMean: 0.16,
  aquaticMedian: 0.16,
  aquaticMin: 0.08,
  aquaticMax: 0.28,
  landPerformance: 0.9,
  waterActivity: 0.04,
  farthestOffshore: 10,
  reachedTarget: 0,
  targetPopulation: 0,
  targetBirths: 0,
  targetPersistenceTicks: 0,
};

function summary(after: Partial<SimulationMetrics>, before: Partial<SimulationMetrics> = {}): EraSummary {
  return { era: 2, before: { ...baseline, ...before }, after: { ...baseline, ...before, ...after } };
}

describe("era causal insights", () => {
  it("prioritizes local births as evidence of colony formation", () => {
    const insight = explainEra(summary(
      { targetPopulation: 15, targetBirths: 4 },
      { targetPopulation: 9, targetBirths: 1 },
    ));
    expect(insight.kind).toBe("colony");
    expect(insight.explanation).toMatch(/born there/i);
    expect(insight.recommendation).toMatch(/far-island land/i);
  });

  it("warns when ecological pressure causes a large population loss", () => {
    const insight = explainEra(summary({ population: 78 }));
    expect(insight.kind).toBe("stress");
    expect(insight.explanation).toMatch(/22%/);
    expect(insight.recommendation).toMatch(/closer to shore/i);
  });

  it("distinguishes reaching the island from establishing there", () => {
    const insight = explainEra(summary({ targetPopulation: 5, reachedTarget: 5 }));
    expect(insight.kind).toBe("crossing");
    expect(insight.explanation).toMatch(/no new local births/i);
  });

  it("identifies inherited swimming change and its land tradeoff", () => {
    const insight = explainEra(summary({ aquaticMean: 0.18, landPerformance: 0.888 }));
    expect(insight.kind).toBe("selection");
    expect(insight.explanation).toMatch(/land performance fell/i);
  });

  it("separates water exploration from genetic selection", () => {
    const insight = explainEra(summary({ aquaticMean: 0.163, waterActivity: 0.16 }));
    expect(insight.kind).toBe("exploration");
    expect(insight.headline).toMatch(/behavior changed/i);
    expect(insight.recommendation).toMatch(/another era/i);
  });

  it("calls out a food pattern that creates little selection", () => {
    const insight = explainEra(summary({ aquaticMean: 0.161, waterActivity: 0.06 }));
    expect(insight.kind).toBe("stable");
    expect(insight.recommendation).toMatch(/shallows/i);
  });
});

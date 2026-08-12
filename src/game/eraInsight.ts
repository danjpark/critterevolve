import type { EraSummary } from "./islandCrossing";

export interface EraInsight {
  kind: "colony" | "crossing" | "selection" | "exploration" | "stress" | "stable";
  headline: string;
  explanation: string;
  recommendation: string;
}

const points = (value: number) => `${Math.abs(value * 100).toFixed(1)} percentage points`;

export function explainEra(summary: EraSummary): EraInsight {
  const { before, after } = summary;
  const aquaticDelta = after.aquaticMean - before.aquaticMean;
  const landDelta = after.landPerformance - before.landPerformance;
  const waterDelta = after.waterActivity - before.waterActivity;
  const targetDelta = after.targetPopulation - before.targetPopulation;
  const birthDelta = after.targetBirths - before.targetBirths;
  const populationDelta = after.population - before.population;
  const populationLossFraction = before.population === 0 ? 0 : -populationDelta / before.population;

  if (birthDelta > 0) {
    return {
      kind: "colony",
      headline: "A colony is taking root",
      explanation: `${Math.max(0, targetDelta)} more critters ended on the far island and ${birthDelta} were born there. This is establishment, not just exploration.`,
      recommendation: "Keep some food on far-island land so the new population can reproduce without becoming over-specialized.",
    };
  }

  if (populationLossFraction >= 0.12) {
    return {
      kind: "stress",
      headline: "The pressure cost too many lives",
      explanation: `Population fell by ${Math.abs(populationDelta)} (${Math.round(populationLossFraction * 100)}%). The reward was too difficult for much of the current population to reach efficiently.`,
      recommendation: "Move at least one patch closer to shore and let intermediate swimmers rebuild the population.",
    };
  }

  if (targetDelta > 0) {
    return {
      kind: "crossing",
      headline: "Explorers reached the far shore",
      explanation: `${targetDelta} more critters completed the channel, but there were no new local births this era. Arrival alone is not yet a colony.`,
      recommendation: "Place food on accessible far-island land to convert crossings into survival and births.",
    };
  }

  if (aquaticDelta >= 0.01) {
    return {
      kind: "selection",
      headline: "Swimming is becoming inherited",
      explanation: `Mean swimming rose ${points(aquaticDelta)}${landDelta < -0.003 ? ` while land performance fell ${points(landDelta)}` : ""}. This is population-level evolution, not only movement.`,
      recommendation: "Continue pushing outward gradually, but watch the land cost before asking for the full crossing.",
    };
  }

  if (waterDelta >= 0.08) {
    return {
      kind: "exploration",
      headline: "Behavior changed before the genes",
      explanation: `Water activity rose ${points(waterDelta)}, while mean swimming changed only ${points(aquaticDelta)}. More critters explored water, but selection has not accumulated yet.`,
      recommendation: "Hold or modestly extend this pressure for another era so successful foragers can reproduce.",
    };
  }

  return {
    kind: "stable",
    headline: "Selection stayed weak",
    explanation: `Swimming changed ${points(aquaticDelta)} and water activity changed ${points(waterDelta)}. The current food pattern mostly rewards the traits the population already has.`,
    recommendation: "Move one patch toward the shallows if you want swimming ability to become advantageous.",
  };
}

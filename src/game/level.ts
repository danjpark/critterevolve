import type { FoodPatch, Habitat, Point, SimulationEnvironment } from "../sim/types";

export const islandCrossingLevel = {
  id: "island-crossing-1",
  width: 1000,
  height: 620,
  leftShoreX: 370,
  deepStartX: 455,
  deepEndX: 595,
  targetShoreX: 680,
  startingCenter: { x: 205, y: 340 },
  naturalFoods: [
    { id: "native-left-north", x: 180, y: 225, value: 0.82, source: "natural", placedEra: 0 },
    { id: "native-left-south", x: 275, y: 430, value: 0.78, source: "natural", placedEra: 0 },
    { id: "native-target", x: 820, y: 330, value: 1.15, source: "natural", placedEra: 0 },
  ] satisfies FoodPatch[],
} as const;

export function habitatAt({ x, y }: Point): Habitat {
  const leftEdge = 370 + 30 * Math.sin((y / islandCrossingLevel.height) * Math.PI * 2.2);
  const rightEdge = 680 + 24 * Math.cos((y / islandCrossingLevel.height) * Math.PI * 2);
  if (x <= leftEdge) return "land";
  if (x >= rightEdge) return "target";
  if (x < islandCrossingLevel.deepStartX || x > islandCrossingLevel.deepEndX) return "shallow";
  return "deep";
}

export const simulationEnvironment = (foods: FoodPatch[]): SimulationEnvironment => ({
  foods,
  habitatAt,
  leftShoreX: islandCrossingLevel.leftShoreX,
  targetShoreX: islandCrossingLevel.targetShoreX,
  width: islandCrossingLevel.width,
  height: islandCrossingLevel.height,
});

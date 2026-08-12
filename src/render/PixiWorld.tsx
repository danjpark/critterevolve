import { useEffect, useRef } from "react";
import { Application, Circle, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { IslandCrossingState } from "../game/islandCrossing";
import { activeFoods } from "../game/islandCrossing";
import { islandCrossingLevel } from "../game/level";
import { balance, palette } from "../game/config";
import type { Critter, Point, SimulationState } from "../sim/types";

export interface WorldTransition {
  from: SimulationState;
  to: SimulationState;
}

export interface TrailPoint extends Point {
  tick: number;
}

interface PixiWorldProps {
  state: IslandCrossingState;
  onPlaceFood(point: Point): void;
  placementEnabled: boolean;
  transition?: WorldTransition;
  transitionProgress: number;
  selectedCritterId?: number;
  selectedTrail: TrailPoint[];
  onSelectCritter(critterId: number): void;
}

interface WorldLayers {
  terrain: Container;
  foods: Container;
  trails: Container;
  critters: Container;
}

interface CritterMotion {
  sprite: Graphics;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  curve: number;
  aquatic: number;
  crossesWater: boolean;
  isNewborn: boolean;
  action: Critter["lastAction"];
}

const textStyle = (size: number, color: number = palette.white, weight: "normal" | "bold" = "normal") =>
  new TextStyle({
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: size,
    fill: color,
    fontWeight: weight,
    letterSpacing: size > 13 ? 1.4 : 0.4,
  });

function mixColor(from: number, to: number, amount: number): number {
  const ar = (from >> 16) & 0xff;
  const ag = (from >> 8) & 0xff;
  const ab = from & 0xff;
  const br = (to >> 16) & 0xff;
  const bg = (to >> 8) & 0xff;
  const bb = to & 0xff;
  return (
    (Math.round(ar + (br - ar) * amount) << 16) |
    (Math.round(ag + (bg - ag) * amount) << 8) |
    Math.round(ab + (bb - ab) * amount)
  );
}

function drawTerrain(layer: Container): void {
  const sea = new Graphics().rect(0, 0, 1000, 620).fill(palette.water);
  layer.addChild(sea);

  const depthBands = new Graphics()
    .rect(370, 0, 85, 620)
    .fill({ color: palette.shallow, alpha: 0.82 })
    .rect(455, 0, 140, 620)
    .fill({ color: palette.deep, alpha: 0.92 })
    .rect(595, 0, 85, 620)
    .fill({ color: palette.shallow, alpha: 0.82 });
  layer.addChild(depthBands);

  const leftShadow = new Graphics()
    .moveTo(0, 34)
    .bezierCurveTo(160, 6, 326, 52, 381, 145)
    .bezierCurveTo(405, 245, 343, 340, 382, 438)
    .bezierCurveTo(341, 548, 191, 606, 0, 579)
    .closePath()
    .fill({ color: palette.ink, alpha: 0.2 });
  leftShadow.position.set(8, 10);
  layer.addChild(leftShadow);

  const leftIsland = new Graphics()
    .moveTo(0, 28)
    .bezierCurveTo(165, 2, 315, 45, 372, 140)
    .bezierCurveTo(395, 237, 337, 336, 372, 431)
    .bezierCurveTo(334, 540, 188, 595, 0, 571)
    .closePath()
    .fill(palette.land)
    .stroke({ color: palette.sand, width: 11, alpha: 0.7 });
  layer.addChild(leftIsland);

  const targetShadow = new Graphics()
    .moveTo(689, 91)
    .bezierCurveTo(769, 23, 908, 39, 1000, 68)
    .lineTo(1000, 574)
    .bezierCurveTo(889, 602, 765, 576, 693, 503)
    .bezierCurveTo(648, 418, 705, 323, 671, 235)
    .bezierCurveTo(650, 174, 651, 126, 689, 91)
    .closePath()
    .fill({ color: palette.ink, alpha: 0.22 });
  targetShadow.position.set(7, 9);
  layer.addChild(targetShadow);

  const targetIsland = new Graphics()
    .moveTo(688, 84)
    .bezierCurveTo(775, 19, 910, 34, 1000, 61)
    .lineTo(1000, 565)
    .bezierCurveTo(884, 594, 762, 568, 690, 494)
    .bezierCurveTo(650, 412, 699, 317, 668, 231)
    .bezierCurveTo(648, 169, 650, 119, 688, 84)
    .closePath()
    .fill(palette.target)
    .stroke({ color: palette.sand, width: 11, alpha: 0.72 });
  layer.addChild(targetIsland);

  const texture = new Graphics();
  for (let index = 0; index < 34; index += 1) {
    const x = (index * 83 + 47) % 1000;
    const y = (index * 137 + 81) % 620;
    if (x > 378 && x < 676) continue;
    texture.circle(x, y, 2 + (index % 3)).fill({ color: palette.landDark, alpha: 0.18 });
  }
  layer.addChild(texture);

  const ripples = new Graphics();
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const x = 400 + column * 42 + (row % 2) * 15;
      const y = 82 + row * 67;
      ripples.moveTo(x, y).quadraticCurveTo(x + 10, y - 4, x + 20, y).stroke({
        color: palette.white,
        width: 1.5,
        alpha: column === 3 ? 0.12 : 0.2,
      });
    }
  }
  layer.addChild(ripples);

  const leftLabel = new Text({ text: "STARTING ISLAND", style: textStyle(13, palette.ink, "bold") });
  leftLabel.position.set(58, 65);
  leftLabel.alpha = 0.62;
  layer.addChild(leftLabel);
  const targetLabel = new Text({ text: "TARGET ISLAND", style: textStyle(13, palette.ink, "bold") });
  targetLabel.position.set(775, 92);
  targetLabel.alpha = 0.68;
  layer.addChild(targetLabel);
  const deepLabel = new Text({ text: "DEEP CHANNEL", style: textStyle(11, palette.white, "bold") });
  deepLabel.anchor.set(0.5);
  deepLabel.position.set(525, 48);
  deepLabel.alpha = 0.46;
  layer.addChild(deepLabel);
}

function drawFoods(layer: Container, state: IslandCrossingState): void {
  for (const food of activeFoods(state)) {
    const isPlayer = food.source === "player";
    const capacity = food.value * balance.foodCapacityMultiplier;
    const fullness = Math.max(0.12, Math.min(1, (state.sim.foodLevels[food.id] ?? capacity) / capacity));
    const marker = new Graphics()
      .circle(0, 0, isPlayer ? 21 : 14)
      .fill({ color: palette.foodGlow, alpha: isPlayer ? 0.13 : 0.09 })
      .circle(0, 0, isPlayer ? 9 : 7)
      .fill(palette.food)
      .circle(-2, -2, isPlayer ? 3 : 2)
      .fill({ color: palette.white, alpha: 0.7 });
    marker.position.set(food.x, food.y);
    marker.scale.set(0.65 + fullness * 0.35);
    marker.alpha = 0.38 + fullness * 0.62;
    layer.addChild(marker);

    if (isPlayer) {
      const stem = new Graphics()
        .moveTo(food.x, food.y - 7)
        .quadraticCurveTo(food.x + 5, food.y - 15, food.x + 10, food.y - 13)
        .stroke({ color: palette.landDark, width: 3, alpha: 0.86 });
      layer.addChild(stem);
    }
  }
}

function createCritterGraphic(critter: Critter, selected: boolean, onSelect: (critterId: number) => void): Graphics {
    const trait = critter.genome.aquaticMovement;
    const color = mixColor(palette.critterLand, palette.critterWater, trait);
    const body = new Graphics();
    const width = 4.4 + trait * 4;
    if (selected) {
      body.circle(0, 0, 12).fill({ color: palette.ink, alpha: 0.28 }).stroke({ color: palette.food, width: 2.2, alpha: 0.95 });
    }
    body.ellipse(0, 0, width, 4.4 - trait * 0.8).fill({ color, alpha: 0.93 });
    body.circle(-1.5, -1.2, 0.9).fill(palette.ink);
    if (trait > 0.36) {
      body
        .moveTo(-width + 1, 0)
        .lineTo(-width - 4, -3.5)
        .lineTo(-width - 3, 3.5)
        .closePath()
        .fill({ color, alpha: 0.8 });
    }
    body.eventMode = "static";
    body.cursor = "pointer";
    body.hitArea = new Circle(0, 0, 11);
    body.on("pointertap", (event) => {
      event.stopPropagation();
      onSelect(critter.id);
    });
    return body;
}

function clearLayer(layer: Container): void {
  layer.removeChildren().forEach((child) => child.destroy({ children: true }));
}

function drawTrackedTrail(layer: Container, trail: TrailPoint[]): void {
  if (trail.length < 2) return;
  const path = new Graphics().moveTo(trail[0].x, trail[0].y);
  for (const point of trail.slice(1)) path.lineTo(point.x, point.y);
  path.stroke({ color: palette.food, width: 2.4, alpha: 0.78 });
  for (const [index, point] of trail.entries()) {
    if (index !== 0 && index !== trail.length - 1 && index % 4 !== 0) continue;
    path.circle(point.x, point.y, index === trail.length - 1 ? 3.5 : 2).fill({ color: palette.food, alpha: 0.82 });
  }
  layer.addChild(path);
}

function drawRestingCritters(
  layer: Container,
  critters: Critter[],
  selectedCritterId: number | undefined,
  onSelect: (critterId: number) => void,
): void {
  clearLayer(layer);
  const sorted = [...critters].sort((a, b) => a.y - b.y);
  for (const critter of sorted) {
    const body = createCritterGraphic(critter, critter.id === selectedCritterId, onSelect);
    body.position.set(critter.x, critter.y);
    body.rotation = ((critter.id * 97) % 31) / 45 - 0.34;
    layer.addChild(body);
  }
}

function buildCritterTransition(
  critterLayer: Container,
  trailLayer: Container,
  transition: WorldTransition,
  selectedCritterId: number | undefined,
  selectedTrail: TrailPoint[],
  onSelect: (critterId: number) => void,
): CritterMotion[] {
  clearLayer(critterLayer);
  clearLayer(trailLayer);
  drawTrackedTrail(trailLayer, selectedTrail);
  const parents = new Map(transition.from.critters.map((critter) => [critter.id, critter]));
  const motions: CritterMotion[] = [];
  const sorted = [...transition.to.critters].sort((a, b) => a.y - b.y);

  for (const critter of sorted) {
    const priorSelf = parents.get(critter.id);
    const parent = priorSelf ?? (critter.parentId === undefined ? undefined : parents.get(critter.parentId)) ?? critter;
    const isNewborn = !priorSelf;
    const crossesWater = parent.habitat !== critter.habitat || critter.habitat === "shallow" || critter.habitat === "deep";
    const body = createCritterGraphic(critter, critter.id === selectedCritterId, onSelect);
    body.position.set(parent.x, parent.y);
    body.alpha = 0.72;
    critterLayer.addChild(body);

    const curve = (((critter.id * 37) % 23) - 11) * 1.35;
    motions.push({
      sprite: body,
      fromX: parent.x,
      fromY: parent.y,
      toX: critter.x,
      toY: critter.y,
      curve,
      aquatic: critter.genome.aquaticMovement,
      crossesWater,
      isNewborn,
      action: critter.lastAction,
    });

    const distance = Math.hypot(critter.x - parent.x, critter.y - parent.y);
    if ((crossesWater || critter.habitat === "target") && distance > 0.2 && critter.id % 4 === 0) {
      const reachedTarget = critter.habitat === "target" && parent.habitat !== "target";
      const trailColor = reachedTarget ? palette.food : mixColor(palette.critterLand, palette.critterWater, critter.genome.aquaticMovement);
      const trail = new Graphics()
        .moveTo(parent.x, parent.y)
        .quadraticCurveTo(
          (parent.x + critter.x) / 2,
          (parent.y + critter.y) / 2 + curve,
          critter.x,
          critter.y,
        )
        .stroke({ color: trailColor, width: reachedTarget ? 2.2 : 1.1, alpha: reachedTarget ? 0.48 : 0.15 });
      trailLayer.addChild(trail);
    }
  }
  return motions;
}

function updateCritterTransition(motions: CritterMotion[], progress: number): void {
  const clamped = Math.min(1, Math.max(0, progress));
  for (const motion of motions) {
    if (motion.sprite.destroyed || !motion.sprite.position) continue;
    // Aquatic adaptation changes how confidently movement unfolds in water,
    // while the final position remains a deterministic simulation outcome.
    const exponent = motion.crossesWater ? 1.7 - motion.aquatic * 0.95 : 1.12;
    const travel = clamped ** exponent;
    const eased = travel * travel * (3 - 2 * travel);
    const x = motion.fromX + (motion.toX - motion.fromX) * eased;
    const y = motion.fromY + (motion.toY - motion.fromY) * eased + Math.sin(Math.PI * eased) * motion.curve;
    motion.sprite.position.set(x, y);
    motion.sprite.rotation = Math.atan2(motion.toY - motion.fromY, motion.toX - motion.fromX) + Math.PI;
    motion.sprite.alpha = Math.min(0.96, (motion.isNewborn ? clamped : 0.68 + clamped * 0.36));
    const birthScale = motion.isNewborn ? 0.2 + clamped * 0.8 : 1;
    const eatingPulse = motion.action === "eating" ? 1 + Math.sin(clamped * Math.PI) * 0.42 : 1;
    motion.sprite.scale.set(birthScale * eatingPulse);
  }
}

export function PixiWorld({
  state,
  onPlaceFood,
  placementEnabled,
  transition,
  transitionProgress,
  selectedCritterId,
  selectedTrail,
  onSelectCritter,
}: PixiWorldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const layersRef = useRef<WorldLayers | null>(null);
  const motionsRef = useRef<CritterMotion[]>([]);
  const stateRef = useRef(state);
  const transitionRef = useRef(transition);
  const handlerRef = useRef(onPlaceFood);
  const enabledRef = useRef(placementEnabled);
  const selectedRef = useRef(selectedCritterId);
  const trailRef = useRef(selectedTrail);
  const selectHandlerRef = useRef(onSelectCritter);

  stateRef.current = state;
  transitionRef.current = transition;
  handlerRef.current = onPlaceFood;
  enabledRef.current = placementEnabled;
  selectedRef.current = selectedCritterId;
  trailRef.current = selectedTrail;
  selectHandlerRef.current = onSelectCritter;

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const app = new Application();
    void app
      .init({
        width: islandCrossingLevel.width,
        height: islandCrossingLevel.height,
        backgroundColor: palette.water,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      })
      .then(() => {
        initialized = true;
        if (cancelled || !hostRef.current) {
          app.destroy(true);
          return;
        }
        appRef.current = app;
        app.canvas.setAttribute("aria-label", "Island Crossing habitat. Click to place food.");
        hostRef.current.appendChild(app.canvas);
        const layers: WorldLayers = {
          terrain: new Container(),
          foods: new Container(),
          trails: new Container(),
          critters: new Container(),
        };
        layersRef.current = layers;
        app.stage.addChild(layers.terrain, layers.foods, layers.trails, layers.critters);
        drawTerrain(layers.terrain);
        drawFoods(layers.foods, stateRef.current);
        if (transitionRef.current) {
          motionsRef.current = buildCritterTransition(
            layers.critters,
            layers.trails,
            transitionRef.current,
            selectedRef.current,
            trailRef.current,
            (critterId) => selectHandlerRef.current(critterId),
          );
        } else {
          drawRestingCritters(
            layers.critters,
            stateRef.current.sim.critters,
            selectedRef.current,
            (critterId) => selectHandlerRef.current(critterId),
          );
        }
        app.stage.eventMode = "static";
        app.stage.hitArea = app.screen;
        app.stage.on("pointertap", (event) => {
          if (!enabledRef.current) return;
          handlerRef.current({ x: event.global.x, y: event.global.y });
        });
      });

    return () => {
      cancelled = true;
      appRef.current = null;
      layersRef.current = null;
      motionsRef.current = [];
      // Pixi v8 initializes asynchronously. Destroying before init resolves
      // breaks React StrictMode's intentional development remount.
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    clearLayer(layers.foods);
    drawFoods(layers.foods, state);
    if (!transition) {
      motionsRef.current = [];
      clearLayer(layers.trails);
      drawTrackedTrail(layers.trails, selectedTrail);
      drawRestingCritters(layers.critters, state.sim.critters, selectedCritterId, onSelectCritter);
    }
  }, [state, transition, selectedCritterId, selectedTrail, onSelectCritter]);

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !transition) return;
    motionsRef.current = buildCritterTransition(
      layers.critters,
      layers.trails,
      transition,
      selectedCritterId,
      selectedTrail,
      onSelectCritter,
    );
    updateCritterTransition(motionsRef.current, transitionProgress);
  }, [transition?.from.tick, transition?.to.tick, selectedCritterId, selectedTrail, onSelectCritter]);

  useEffect(() => {
    updateCritterTransition(motionsRef.current, transitionProgress);
  }, [transitionProgress]);

  return <div className={`world-canvas ${placementEnabled ? "is-placing" : ""}`} ref={hostRef} />;
}

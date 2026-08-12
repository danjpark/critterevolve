import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { IslandCrossingState } from "../game/islandCrossing";
import { activeFoods } from "../game/islandCrossing";
import { islandCrossingLevel } from "../game/level";
import { palette } from "../game/config";
import type { Point } from "../sim/types";

interface PixiWorldProps {
  state: IslandCrossingState;
  onPlaceFood(point: Point): void;
  placementEnabled: boolean;
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
    const marker = new Graphics()
      .circle(0, 0, isPlayer ? 21 : 14)
      .fill({ color: palette.foodGlow, alpha: isPlayer ? 0.13 : 0.09 })
      .circle(0, 0, isPlayer ? 9 : 7)
      .fill(palette.food)
      .circle(-2, -2, isPlayer ? 3 : 2)
      .fill({ color: palette.white, alpha: 0.7 });
    marker.position.set(food.x, food.y);
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

function drawCritters(layer: Container, state: IslandCrossingState): void {
  const sorted = [...state.sim.critters].sort((a, b) => a.y - b.y);
  for (const critter of sorted) {
    const trait = critter.genome.aquaticMovement;
    const color = mixColor(palette.critterLand, palette.critterWater, trait);
    const body = new Graphics();
    const width = 4.4 + trait * 4;
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
    body.position.set(critter.x, critter.y);
    body.rotation = ((critter.id * 97) % 31) / 45 - 0.34;
    layer.addChild(body);
  }
}

function redraw(stage: Container, state: IslandCrossingState): void {
  stage.removeChildren().forEach((child) => child.destroy({ children: true }));
  drawTerrain(stage);
  drawFoods(stage, state);
  drawCritters(stage, state);
}

export function PixiWorld({ state, onPlaceFood, placementEnabled }: PixiWorldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const stateRef = useRef(state);
  const handlerRef = useRef(onPlaceFood);
  const enabledRef = useRef(placementEnabled);

  stateRef.current = state;
  handlerRef.current = onPlaceFood;
  enabledRef.current = placementEnabled;

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
        app.stage.eventMode = "static";
        app.stage.hitArea = app.screen;
        app.stage.on("pointertap", (event) => {
          if (!enabledRef.current) return;
          handlerRef.current({ x: event.global.x, y: event.global.y });
        });
        redraw(app.stage, stateRef.current);
      });

    return () => {
      cancelled = true;
      appRef.current = null;
      // Pixi v8 initializes asynchronously. Destroying before init resolves
      // breaks React StrictMode's intentional development remount.
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    if (appRef.current) redraw(appRef.current.stage, state);
  }, [state]);

  return <div className={`world-canvas ${placementEnabled ? "is-placing" : ""}`} ref={hostRef} />;
}

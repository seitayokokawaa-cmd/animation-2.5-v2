/**
 * Compiler (M2.5): validated MFS document → core Film IR. All unit
 * conversion happens here, once: seconds → ticks, degrees → radians, hex
 * strings → parsed colors, author shapes → core shapes. Sampling the
 * result at any tick is a pure function.
 */

import {
  createTimeline,
  createTrack,
  degToRad,
  lerp,
  lerpVec2,
  parseColor,
  sceneAtTick,
  secondsToTicks,
  vec2,
  type AnyTrack,
  type Clip,
  type Fill,
  type Film,
  type FilmCaption,
  type FilmInstance,
  type FilmScene,
  type Shape,
  type Stroke,
  type Tick,
  type Vec2,
} from '@motionforge/core';

import type { MfsDocument, MfsShapeDef } from './schema.js';

export { sceneAtTick };
export type { Film, FilmScene, FilmInstance, FilmCaption };

function toCoreShape(def: MfsShapeDef): Shape {
  switch (def.kind) {
    case 'rect':
      return { kind: 'rect', width: def.width, height: def.height, rx: def.rx };
    case 'circle':
      return { kind: 'circle', r: def.r };
    case 'ellipse':
      return { kind: 'ellipse', rx: def.rx, ry: def.ry };
    case 'polygon':
      return { kind: 'polygon', points: def.points.map(([x, y]) => vec2(x, y)) };
  }
}

const toFill = (def: MfsShapeDef): Fill | undefined =>
  def.fill ? { color: parseColor(def.fill) } : undefined;

const toStroke = (def: MfsShapeDef): Stroke | undefined =>
  def.stroke ? { color: parseColor(def.stroke.color), width: def.stroke.width } : undefined;

export function compile(doc: MfsDocument): Film {
  const [width, height] = doc.meta.resolution.split('x').map(Number) as [number, number];

  let filmTick: Tick = 0;
  const scenes: FilmScene[] = doc.scenes.map((scene) => {
    const durationTicks = secondsToTicks(scene.duration);

    const instances: FilmInstance[] = scene.place.map((p) => {
      const def = doc.shapes[p.ref]!;
      return {
        id: p.as,
        shape: toCoreShape(def),
        fill: toFill(def),
        stroke: toStroke(def),
        depth: p.depth ?? 0.5,
        layer: p.layer ?? 0,
      };
    });

    const posClips = new Map<string, Clip<Vec2>[]>();
    const rotClips = new Map<string, Clip<number>[]>();
    const scaleClips = new Map<string, Clip<number>[]>();
    const cameraPosClips: Clip<Vec2>[] = [];
    const cameraZoomClips: Clip<number>[] = [];
    const captions: FilmCaption[] = [];

    const baseOf = (target: string) => scene.place.find((p) => p.as === target)!;

    // Running end-state so consecutive tweens chain ("then move there").
    const lastPos = new Map<string, Vec2>();
    const lastRot = new Map<string, number>();
    const lastScale = new Map<string, number>();
    let lastCameraPos = vec2(0, 0);
    let lastCameraZoom = 1;

    for (const action of scene.actions) {
      const start = secondsToTicks(action.at);
      if (action.move) {
        const { target, to, duration, easing } = action.move;
        const from = lastPos.get(target) ?? vec2(...baseOf(target).at);
        const toVec = vec2(...to);
        (posClips.get(target) ?? posClips.set(target, []).get(target)!).push({
          start,
          duration: secondsToTicks(duration),
          from,
          to: toVec,
          easing,
        });
        lastPos.set(target, toVec);
      } else if (action.rotate) {
        const { target, to, duration, easing } = action.rotate;
        const from = lastRot.get(target) ?? degToRad(baseOf(target).rotate ?? 0);
        const toRad = degToRad(to);
        (rotClips.get(target) ?? rotClips.set(target, []).get(target)!).push({
          start,
          duration: secondsToTicks(duration),
          from,
          to: toRad,
          easing,
        });
        lastRot.set(target, toRad);
      } else if (action.scale) {
        const { target, to, duration, easing } = action.scale;
        const from = lastScale.get(target) ?? baseOf(target).scale ?? 1;
        (scaleClips.get(target) ?? scaleClips.set(target, []).get(target)!).push({
          start,
          duration: secondsToTicks(duration),
          from,
          to,
          easing,
        });
        lastScale.set(target, to);
      } else if (action.camera) {
        const { to, zoom, duration, easing } = action.camera;
        const durationTicksC = secondsToTicks(duration);
        if (to) {
          const toVec = vec2(...to);
          cameraPosClips.push({
            start,
            duration: durationTicksC,
            from: lastCameraPos,
            to: toVec,
            easing,
          });
          lastCameraPos = toVec;
        }
        if (zoom !== undefined) {
          cameraZoomClips.push({
            start,
            duration: durationTicksC,
            from: lastCameraZoom,
            to: zoom,
            easing,
          });
          lastCameraZoom = zoom;
        }
      } else if (action.caption) {
        const c = action.caption;
        captions.push({
          text: c.text,
          startTick: start,
          durationTicks: secondsToTicks(c.duration),
          at: c.at ? vec2(...c.at) : vec2(0, -3.5),
          size: c.size ?? 0.6,
          color: parseColor(c.color ?? '#ffffff'),
          font: c.font ?? 'noto-sans',
        });
      }
    }

    const tracks: AnyTrack[] = [];
    for (const p of scene.place) {
      tracks.push(
        createTrack<Vec2>(`${p.as}/pos`, vec2(...p.at), posClips.get(p.as) ?? [], lerpVec2),
        createTrack<number>(`${p.as}/rot`, degToRad(p.rotate ?? 0), rotClips.get(p.as) ?? [], lerp),
        createTrack<number>(`${p.as}/scale`, p.scale ?? 1, scaleClips.get(p.as) ?? [], lerp),
      );
    }
    tracks.push(
      createTrack<Vec2>('camera/pos', vec2(0, 0), cameraPosClips, lerpVec2),
      createTrack<number>('camera/zoom', 1, cameraZoomClips, lerp),
    );

    const compiled: FilmScene = {
      id: scene.id,
      startTick: filmTick,
      durationTicks,
      instances,
      timeline: createTimeline(tracks, [], durationTicks),
      captions,
    };
    filmTick += durationTicks;
    return compiled;
  });

  return {
    title: doc.meta.title,
    width,
    height,
    fps: doc.meta.fps,
    seed: doc.meta.seed,
    background: doc.meta.background ? parseColor(doc.meta.background) : undefined,
    durationTicks: filmTick,
    scenes,
  };
}

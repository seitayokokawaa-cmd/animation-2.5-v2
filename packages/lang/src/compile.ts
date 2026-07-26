/**
 * Compiler (M2.5): validated MFS document → film IR. All unit conversion
 * happens here, once: seconds → ticks, degrees → radians. The IR is pure
 * data + core timelines; sampling any tick is a pure function.
 */

import {
  createTimeline,
  createTrack,
  degToRad,
  lerp,
  lerpVec2,
  secondsToTicks,
  vec2,
  type AnyTrack,
  type Clip,
  type Tick,
  type Timeline,
  type Vec2,
} from '@motionforge/core';

import type { MfsDocument, MfsShapeDef } from './schema.js';

export interface CompiledInstance {
  readonly id: string;
  readonly shape: MfsShapeDef;
  readonly depth: number;
  readonly layer: number;
}

export interface CompiledCaption {
  readonly text: string;
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  /** World units. */
  readonly at: Vec2;
  /** World units tall. */
  readonly size: number;
  readonly color: string;
  readonly font: string;
}

export interface CompiledScene {
  readonly id: string;
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  readonly instances: readonly CompiledInstance[];
  /**
   * Tracks: `<instance>/pos` (Vec2), `<instance>/rot` (radians),
   * `<instance>/scale` (number), `camera/pos` (Vec2), `camera/zoom`
   * (number). Ticks are scene-local.
   */
  readonly timeline: Timeline;
  readonly captions: readonly CompiledCaption[];
}

export interface FilmIR {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly seed: number;
  readonly background?: string;
  readonly durationTicks: Tick;
  readonly scenes: readonly CompiledScene[];
}

/** The scene covering a film tick (last scene owns the final instant). */
export function sceneAtTick(film: FilmIR, tick: Tick): CompiledScene {
  for (const scene of film.scenes) {
    if (tick >= scene.startTick && tick < scene.startTick + scene.durationTicks) return scene;
  }
  const last = film.scenes[film.scenes.length - 1];
  if (!last) throw new Error('Film has no scenes');
  return last;
}

export function compile(doc: MfsDocument): FilmIR {
  const [width, height] = doc.meta.resolution.split('x').map(Number) as [number, number];

  let filmTick: Tick = 0;
  const scenes: CompiledScene[] = doc.scenes.map((scene) => {
    const durationTicks = secondsToTicks(scene.duration);

    const instances: CompiledInstance[] = scene.place.map((p) => ({
      id: p.as,
      shape: doc.shapes[p.ref]!,
      depth: p.depth ?? 0.5,
      layer: p.layer ?? 0,
    }));

    // Collect clips per track, then build tracks with validated ordering.
    const posClips = new Map<string, Clip<Vec2>[]>();
    const rotClips = new Map<string, Clip<number>[]>();
    const scaleClips = new Map<string, Clip<number>[]>();
    const cameraPosClips: Clip<Vec2>[] = [];
    const cameraZoomClips: Clip<number>[] = [];
    const captions: CompiledCaption[] = [];

    const baseOf = (target: string) => scene.place.find((p) => p.as === target)!;

    // Track running end-state so consecutive tweens chain from the previous
    // value (authors think "then move there").
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
          color: c.color ?? '#ffffff',
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

    const compiled: CompiledScene = {
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
    background: doc.meta.background,
    durationTicks: filmTick,
    scenes,
  };
}

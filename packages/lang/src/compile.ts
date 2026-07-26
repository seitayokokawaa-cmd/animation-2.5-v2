/**
 * Compiler (M2.5 + M3.5): validated MFS document → core Film IR. All unit
 * conversion happens here, once: seconds → ticks, degrees → radians, hex
 * strings → parsed colors, author shapes → core shapes — and narration
 * phrase anchors → ticks against the frozen voice cache.
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
  ticksToSeconds,
  tokenizeWords,
  vec2,
  type AnyTrack,
  type Clip,
  type Fill,
  type Film,
  type FilmCaption,
  type FilmCard,
  type FilmEffect,
  type FilmInstance,
  type FilmNarrationSegment,
  type FilmScene,
  type Shape,
  type Stroke,
  type Tick,
  type Vec2,
} from '@motionforge/core';

import { findPhrase, type MfsAnchor } from './narration.js';
import type { MfsDocument, MfsShapeDef, verbSchema } from './schema.js';
import type { z } from 'zod';

export { sceneAtTick };
export type { Film, FilmScene, FilmInstance, FilmCaption };

type MfsVerb = z.infer<typeof verbSchema>;

/** Default silence appended after each narration segment, seconds. */
export const DEFAULT_SEGMENT_PAUSE = 0.3;

// ---- voice data (structural, supplied by the CLI from @motionforge/voice) --

export interface NarrationWordTiming {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

export interface NarrationSegmentData {
  readonly hash: string;
  readonly durationSeconds: number;
  readonly words: readonly NarrationWordTiming[];
}

/** Frozen narration lookup by segment key (`sceneId/index`). */
export interface VoiceData {
  readonly segment: (key: string) => NarrationSegmentData | undefined;
}

// ---- shape/paint conversion ------------------------------------------------

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

// ---- anchors ----------------------------------------------------------------

const anchorPhrase = (anchor: MfsAnchor): string =>
  typeof anchor === 'string' ? anchor : anchor.phrase;

const anchorNth = (anchor: MfsAnchor): number => (typeof anchor === 'string' ? 1 : anchor.nth);

/**
 * Resolve an anchor to seconds from segment start. Throws with a precise
 * message on missing phrases/occurrences (the validator surfaces the same
 * findings pre-compile in M3.7).
 */
export function resolveAnchorSeconds(
  anchor: MfsAnchor,
  segmentText: string,
  words: readonly NarrationWordTiming[],
  offset = 0,
): number {
  const phrase = anchorPhrase(anchor);
  const hits = findPhrase(tokenizeWords(segmentText), phrase);
  if (hits.length === 0) {
    throw new Error(`Anchor phrase ${JSON.stringify(phrase)} not found in narration segment`);
  }
  const nth = anchorNth(anchor);
  const hit = hits[nth - 1];
  if (hit === undefined) {
    throw new Error(
      `Anchor phrase ${JSON.stringify(phrase)} occurs ${hits.length}x but nth=${nth} was requested`,
    );
  }
  const timing = words[hit];
  if (!timing) {
    throw new Error(
      `Alignment for segment has ${words.length} words but anchor resolves to word #${hit + 1} — re-run mf voice sync`,
    );
  }
  return Math.max(0, timing.start + offset);
}

// ---- timing report (mf timing) ----------------------------------------------

export interface TimingMarker {
  readonly sceneId: string;
  readonly kind: 'word' | 'sync';
  readonly label: string;
  /** Film-global seconds. */
  readonly seconds: number;
  readonly tick: Tick;
}

/** Human/LLM-facing marker table: where every word and sync event lands. */
export function timingTable(markers: readonly TimingMarker[]): string {
  const rows = markers.map(
    (m) =>
      `${m.seconds.toFixed(3).padStart(8)}s  t${String(m.tick).padStart(5, '0')}  ${m.sceneId.padEnd(14)} ${m.kind === 'sync' ? '▶' : ' '} ${m.label}`,
  );
  return ['  seconds   tick   scene           marker', ...rows].join('\n');
}

// ---- compile -----------------------------------------------------------------

export interface CompileResult {
  readonly film: Film;
  readonly markers: readonly TimingMarker[];
}

export function compile(doc: MfsDocument, voice?: VoiceData): Film {
  return compileWithMarkers(doc, voice).film;
}

export function compileWithMarkers(doc: MfsDocument, voice?: VoiceData): CompileResult {
  const [width, height] = doc.meta.resolution.split('x').map(Number) as [number, number];
  const markers: TimingMarker[] = [];

  let filmTick: Tick = 0;
  const scenes: FilmScene[] = doc.scenes.map((scene) => {
    // -- narration schedule + derived duration --------------------------------
    const narration: FilmNarrationSegment[] = [];
    interface ScheduledSegment {
      startSeconds: number;
      data: NarrationSegmentData;
      index: number;
    }
    const scheduled: ScheduledSegment[] = [];
    let narrationSeconds = 0;
    scene.narration.forEach((segment, index) => {
      const key = `${scene.id}/${index}`;
      const data = voice?.segment(key);
      if (!data) {
        throw new Error(
          `Scene "${scene.id}": narration segment ${key} is not in the voice cache — run \`mf voice sync\` first`,
        );
      }
      scheduled.push({ startSeconds: narrationSeconds, data, index });
      narration.push({
        key,
        hash: data.hash,
        startTick: secondsToTicks(narrationSeconds),
        durationTicks: secondsToTicks(data.durationSeconds),
      });
      narrationSeconds += data.durationSeconds + (segment.pause ?? DEFAULT_SEGMENT_PAUSE);
    });

    const durationTicks =
      scene.duration !== undefined
        ? secondsToTicks(scene.duration)
        : secondsToTicks(narrationSeconds);
    if (durationTicks <= 0) {
      throw new Error(`Scene "${scene.id}": empty duration`);
    }

    // -- instances -------------------------------------------------------------
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

    // -- events: timed actions + resolved sync anchors, in tick order ---------
    interface TimedVerb {
      startTick: Tick;
      verb: MfsVerb;
    }
    const events: TimedVerb[] = scene.actions.map((action) => ({
      startTick: secondsToTicks(action.at),
      verb: action as MfsVerb,
    }));

    scene.narration.forEach((segment, index) => {
      const slot = scheduled[index]!;
      for (const sync of segment.sync) {
        const seconds =
          slot.startSeconds +
          resolveAnchorSeconds(sync.on, segment.text, slot.data.words, sync.offset ?? 0);
        const startTick = secondsToTicks(seconds);
        events.push({ startTick, verb: sync.do });
        markers.push({
          sceneId: scene.id,
          kind: 'sync',
          label: `on ${JSON.stringify(anchorPhrase(sync.on))}`,
          seconds: ticksToSeconds(filmTick) + seconds,
          tick: filmTick + startTick,
        });
      }
      for (const timing of slot.data.words) {
        markers.push({
          sceneId: scene.id,
          kind: 'word',
          label: timing.word,
          seconds: ticksToSeconds(filmTick) + slot.startSeconds + timing.start,
          tick: filmTick + secondsToTicks(slot.startSeconds + timing.start),
        });
      }
    });

    events.sort((a, b) => a.startTick - b.startTick);

    // -- verb application (chaining semantics follow tick order) --------------
    const posClips = new Map<string, Clip<Vec2>[]>();
    const rotClips = new Map<string, Clip<number>[]>();
    const scaleClips = new Map<string, Clip<number>[]>();
    const cameraPosClips: Clip<Vec2>[] = [];
    const cameraZoomClips: Clip<number>[] = [];
    const captions: FilmCaption[] = [];
    const cards: FilmCard[] = [];
    const effects: FilmEffect[] = [];
    let effectCounter = 0;

    /** Emphasis/FX verbs → registry effects with per-effect noise seeds. */
    const pushEffect = (
      target: string,
      verbName: string,
      startTick: Tick,
      durationSeconds: number,
      params: Record<string, number>,
    ): void => {
      effects.push({
        target,
        verb: verbName,
        startTick,
        durationTicks: secondsToTicks(durationSeconds),
        params,
        seed: `${verbName}/${scene.id}/${effectCounter++}`,
      });
    };

    /** Defaults mirror the motion verb registry (drift-checked by M12.5). */
    const EFFECT_DEFAULT_SECONDS: Record<string, number> = {
      'pop-in': 0.4,
      'pop-out': 0.3,
      'spin-in': 0.5,
      slam: 0.45,
      wiggle: 0.8,
      pulse: 0.5,
      explode: 0.8,
      'impact-stars': 0.6,
      speedlines: 0.6,
      sweat: 0.9,
      steam: 1,
      'squash-stretch': 0.6,
    };

    /** FX verbs share one shape: target + duration + numeric params. */
    const simpleFx = (
      verbName: string,
      payload: { target: string; duration?: number | undefined } & Record<string, unknown>,
      startTick: Tick,
      paramKeys: string[],
    ): void => {
      const params: Record<string, number> = {};
      for (const key of paramKeys) {
        const value = payload[key];
        if (typeof value === 'number') params[key] = value;
      }
      pushEffect(
        payload.target,
        verbName,
        startTick,
        payload.duration ?? EFFECT_DEFAULT_SECONDS[verbName]!,
        params,
      );
    };

    const baseOf = (target: string) => scene.place.find((p) => p.as === target)!;
    const lastPos = new Map<string, Vec2>();
    const lastRot = new Map<string, number>();
    const lastScale = new Map<string, number>();
    let lastCameraPos = vec2(0, 0);
    let lastCameraZoom = 1;

    for (const { startTick, verb } of events) {
      if (verb.move) {
        const { target, to, duration, easing } = verb.move;
        const from = lastPos.get(target) ?? vec2(...baseOf(target).at);
        const toVec = vec2(...to);
        (posClips.get(target) ?? posClips.set(target, []).get(target)!).push({
          start: startTick,
          duration: secondsToTicks(duration),
          from,
          to: toVec,
          easing,
        });
        lastPos.set(target, toVec);
      } else if (verb.rotate) {
        const { target, to, duration, easing } = verb.rotate;
        const from = lastRot.get(target) ?? degToRad(baseOf(target).rotate ?? 0);
        const toRad = degToRad(to);
        (rotClips.get(target) ?? rotClips.set(target, []).get(target)!).push({
          start: startTick,
          duration: secondsToTicks(duration),
          from,
          to: toRad,
          easing,
        });
        lastRot.set(target, toRad);
      } else if (verb.scale) {
        const { target, to, duration, easing } = verb.scale;
        const from = lastScale.get(target) ?? baseOf(target).scale ?? 1;
        (scaleClips.get(target) ?? scaleClips.set(target, []).get(target)!).push({
          start: startTick,
          duration: secondsToTicks(duration),
          from,
          to,
          easing,
        });
        lastScale.set(target, to);
      } else if (verb.camera) {
        const { to, zoom, duration, easing } = verb.camera;
        const clipTicks = secondsToTicks(duration);
        if (to) {
          const toVec = vec2(...to);
          cameraPosClips.push({
            start: startTick,
            duration: clipTicks,
            from: lastCameraPos,
            to: toVec,
            easing,
          });
          lastCameraPos = toVec;
        }
        if (zoom !== undefined) {
          cameraZoomClips.push({
            start: startTick,
            duration: clipTicks,
            from: lastCameraZoom,
            to: zoom,
            easing,
          });
          lastCameraZoom = zoom;
        }
      } else if (verb['bounce-to']) {
        const { target, to, duration, hops, height } = verb['bounce-to'];
        const from = lastPos.get(target) ?? vec2(...baseOf(target).at);
        const toVec = vec2(...to);
        const distance = Math.hypot(toVec.x - from.x, toVec.y - from.y);
        const hopCount = hops ?? Math.max(1, Math.round(distance / 1.5));
        const seconds = duration ?? hopCount * 0.35;
        (posClips.get(target) ?? posClips.set(target, []).get(target)!).push({
          start: startTick,
          duration: secondsToTicks(seconds),
          from,
          to: toVec,
          easing: 'linear',
        });
        lastPos.set(target, toVec);
        pushEffect(target, 'bounce-bob', startTick, seconds, {
          hops: hopCount,
          ...(height !== undefined ? { height } : {}),
        });
      } else if (verb.explode) {
        simpleFx('explode', verb.explode, startTick, ['radius']);
      } else if (verb['impact-stars']) {
        simpleFx('impact-stars', verb['impact-stars'], startTick, ['count']);
      } else if (verb.speedlines) {
        simpleFx('speedlines', verb.speedlines, startTick, ['angle']);
      } else if (verb.sweat) {
        simpleFx('sweat', verb.sweat, startTick, ['count']);
      } else if (verb.steam) {
        simpleFx('steam', verb.steam, startTick, []);
      } else if (verb['squash-stretch']) {
        simpleFx('squash-stretch', verb['squash-stretch'], startTick, ['amount', 'beats']);
      } else if (verb['pop-in']) {
        const { target, duration, to } = verb['pop-in'];
        pushEffect(target, 'pop-in', startTick, duration ?? EFFECT_DEFAULT_SECONDS['pop-in']!, {
          ...(to !== undefined ? { to } : {}),
        });
      } else if (verb['pop-out']) {
        const { target, duration } = verb['pop-out'];
        pushEffect(
          target,
          'pop-out',
          startTick,
          duration ?? EFFECT_DEFAULT_SECONDS['pop-out']!,
          {},
        );
      } else if (verb['spin-in']) {
        const { target, duration, turns } = verb['spin-in'];
        pushEffect(target, 'spin-in', startTick, duration ?? EFFECT_DEFAULT_SECONDS['spin-in']!, {
          ...(turns !== undefined ? { turns } : {}),
        });
      } else if (verb.slam) {
        const { target, duration, height, shake } = verb.slam;
        const seconds = duration ?? EFFECT_DEFAULT_SECONDS.slam!;
        pushEffect(target, 'slam', startTick, seconds, {
          ...(height !== undefined ? { height } : {}),
        });
        const intensity = shake ?? 0.3;
        if (intensity > 0) {
          // Shake starts at impact (60% into the slam).
          pushEffect('camera', 'shake', startTick + secondsToTicks(seconds * 0.6), 0.4, {
            intensity,
          });
        }
      } else if (verb.wiggle) {
        const { target, duration, amplitude, speed } = verb.wiggle;
        pushEffect(target, 'wiggle', startTick, duration ?? EFFECT_DEFAULT_SECONDS.wiggle!, {
          ...(amplitude !== undefined ? { amplitude } : {}),
          ...(speed !== undefined ? { speed } : {}),
        });
      } else if (verb.pulse) {
        const { target, duration, to } = verb.pulse;
        pushEffect(target, 'pulse', startTick, duration ?? EFFECT_DEFAULT_SECONDS.pulse!, {
          ...(to !== undefined ? { to } : {}),
        });
      } else if (verb.card) {
        const c = verb.card;
        const big = c.style === 'date' || c.style === 'chapter';
        cards.push({
          style: c.style,
          text: c.text,
          items: c.items,
          at: c.at ? vec2(...c.at) : vec2(0, big ? 0 : -2.8),
          startTick,
          durationTicks: secondsToTicks(c.duration),
          size: c.size ?? (big ? 0.9 : 0.5),
          entrance: c.entrance ?? (big ? 'slam' : 'pop'),
          font: c.font ?? 'noto-sans',
        });
      } else if (verb.cutaway) {
        const c = verb.cutaway;
        const def = doc.shapes[c.ref];
        if (!def) {
          throw new Error(`Scene "${scene.id}": cutaway references unknown shape "${c.ref}"`);
        }
        cards.push({
          style: 'note',
          text: undefined,
          at: c.at ? vec2(...c.at) : vec2(0, 0),
          startTick,
          durationTicks: secondsToTicks(c.duration),
          size: 0.8,
          entrance: c.entrance ?? 'pop',
          font: 'noto-sans',
          content: {
            shape: toCoreShape(def),
            fill: toFill(def),
            stroke: toStroke(def),
            scale: c.scale ?? 1,
          },
        });
      } else if (verb.caption) {
        const c = verb.caption;
        captions.push({
          text: c.text,
          startTick,
          durationTicks: secondsToTicks(c.duration),
          at: c.at ? vec2(...c.at) : vec2(0, -3.5),
          size: c.size ?? 0.6,
          color: c.color ? parseColor(c.color) : undefined,
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
      narration,
      effects,
      cards,
      instances,
      timeline: createTimeline(tracks, [], durationTicks),
      captions,
    };
    filmTick += durationTicks;
    return compiled;
  });

  markers.sort((a, b) => a.tick - b.tick);
  return {
    film: {
      title: doc.meta.title,
      width,
      height,
      fps: doc.meta.fps,
      seed: doc.meta.seed,
      style: doc.meta.style,
      background: doc.meta.background ? parseColor(doc.meta.background) : undefined,
      durationTicks: filmTick,
      scenes,
    },
    markers,
  };
}

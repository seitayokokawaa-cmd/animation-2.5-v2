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
  type FilmLine,
  type FilmNarrationSegment,
  type FilmScene,
  type Shape,
  type Stroke,
  type Tick,
  type Vec2,
} from '@motionforge/core';

import {
  degToRad as degToRadCore,
  type Color,
  type ObjectSpec,
  type PartSpec,
} from '@motionforge/core';

import { findPhrase, type MfsAnchor } from './narration.js';
import type { MfsObjectDef, MfsPart } from './parts.js';
import {
  GESTURE_CHOICES,
  REACTION_CHOICES,
  type MfsDocument,
  type MfsShapeDef,
  type verbSchema,
} from './schema.js';
import { STAGE_PRESETS } from './stage.js';
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

// ---- map data (structural, supplied by the CLI from @motionforge/maps) -----

export interface MapRegionData {
  readonly id: string;
  /** World units, map-local. */
  readonly centroid: Vec2;
  readonly bbox: { readonly min: Vec2; readonly max: Vec2 };
}

/** A compiled, styled map ready to place as an object instance (M7.2). */
export interface MapData {
  readonly objectSpec: ObjectSpec;
  readonly regions: readonly MapRegionData[];
  readonly groups: Readonly<Record<string, readonly string[]>>;
}

/** Compiled maps by `maps:` name (the CLI builds these from geodata). */
export interface MapsData {
  readonly map: (name: string) => MapData | undefined;
}

// ---- shape/paint conversion ------------------------------------------------

function toCoreShape(def: MfsShapeDef | NonNullable<MfsPart['shape']>): Shape {
  switch (def.kind) {
    case 'rect':
      return { kind: 'rect', width: def.width, height: def.height, rx: def.rx };
    case 'circle':
      return { kind: 'circle', r: def.r };
    case 'ellipse':
      return { kind: 'ellipse', rx: def.rx, ry: def.ry };
    case 'polygon':
      return { kind: 'polygon', points: def.points.map(([x, y]) => vec2(x, y)) };
    case 'path':
      return { kind: 'path', d: def.d };
  }
}

const toFill = (def: MfsShapeDef): Fill | undefined =>
  def.fill ? { color: parseColor(def.fill) } : undefined;

const toStroke = (def: MfsShapeDef): Stroke | undefined =>
  def.stroke ? { color: parseColor(def.stroke.color), width: def.stroke.width } : undefined;

// ---- object specs ------------------------------------------------------------

function toPartFill(fill: MfsPart['fill']): PartSpec['fill'] {
  if (fill === undefined) return undefined;
  if (typeof fill === 'string') {
    return fill.startsWith('$') ? { param: fill.slice(1) } : { color: parseColor(fill) };
  }
  return {
    gradient: {
      from: vec2(...fill.from),
      to: vec2(...fill.to),
      stops: fill.stops.map((s) => ({ offset: s.offset, color: parseColor(s.color) })),
    },
  };
}

function toPartSpec(part: MfsPart): PartSpec {
  return {
    id: part.id,
    at: part.at ? vec2(...part.at) : undefined,
    rotate: part.rotate !== undefined ? degToRadCore(part.rotate) : undefined,
    scale: part.scale,
    pivot: part.pivot ? vec2(...part.pivot) : undefined,
    z: part.z,
    shape: part.shape ? toCoreShape(part.shape as MfsShapeDef) : undefined,
    fill: toPartFill(part.fill),
    stroke: part.stroke
      ? { color: parseColor(part.stroke.color), width: part.stroke.width }
      : undefined,
    children: part.parts?.map(toPartSpec),
  };
}

export function toObjectSpec(def: MfsObjectDef): ObjectSpec {
  const params: Record<string, Color> = {};
  for (const [name, hex] of Object.entries(def.params)) params[name] = parseColor(hex);
  return { params, parts: def.parts.map(toPartSpec) };
}

// ---- cast --------------------------------------------------------------------

/** YAML palette slots (kebab-case) → character-template slot names. */
const CAST_SLOT_NAMES: Readonly<Record<string, string>> = {
  skin: 'skin',
  outfit: 'outfit',
  'outfit-dark': 'outfitDark',
  outline: 'outline',
  boots: 'boots',
};

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

/** Resolve a map endpoint: region id → centroid, [x,y] → point. */
function resolveMapPoint(
  sceneId: string,
  instName: string,
  entry: MapData,
  endpoint: string | readonly [number, number],
): Vec2 {
  if (Array.isArray(endpoint)) return vec2(endpoint[0]!, endpoint[1]!);
  const region = entry.regions.find((r) => r.id === endpoint);
  if (!region) {
    throw new Error(
      `Scene "${sceneId}": map point "${String(endpoint)}" is not a region on "${instName}"`,
    );
  }
  return region.centroid;
}

/** Unit kinds by index — order matches maps' UNIT_KINDS. */
const UNIT_KIND_NAMES = ['infantry', 'cavalry', 'ship', 'plane'];

const packHex = (hex: string): number => {
  const c = parseColor(hex);
  return (c.r << 16) | (c.g << 8) | c.b;
};

/** Resolve which placed map a map/arrow verb addresses. */
function resolveMapTarget(
  sceneId: string,
  placedMaps: ReadonlyMap<string, MapData>,
  target: string | undefined,
): [string, MapData] {
  const name =
    target ??
    (placedMaps.size === 1
      ? [...placedMaps.keys()][0]!
      : (() => {
          throw new Error(
            `Scene "${sceneId}": map verb needs target: — the scene places ${placedMaps.size} maps`,
          );
        })());
  const entry = placedMaps.get(name);
  if (!entry) {
    throw new Error(`Scene "${sceneId}": map verb targets "${name}", not a placed map`);
  }
  return [name, entry];
}

// ---- compile -----------------------------------------------------------------

export interface CompileResult {
  readonly film: Film;
  readonly markers: readonly TimingMarker[];
}

export function compile(doc: MfsDocument, voice?: VoiceData, maps?: MapsData): Film {
  return compileWithMarkers(doc, voice, maps).film;
}

export function compileWithMarkers(
  doc: MfsDocument,
  voice?: VoiceData,
  maps?: MapsData,
): CompileResult {
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

    // -- character lines (M8.4): anchored to a phrase's end -------------------
    const filmLines: FilmLine[] = [];
    let linesEndSeconds = 0;
    scene.lines.forEach((line, index) => {
      const key = `${scene.id}/line/${index}`;
      const data = voice?.segment(key);
      if (!data) {
        throw new Error(
          `Scene "${scene.id}": line ${key} is not in the voice cache — run \`mf voice sync\` first`,
        );
      }
      const phrase = anchorPhrase(line.after);
      const phraseLength = tokenizeWords(phrase).length;
      let startSeconds: number | undefined;
      for (const slot of scheduled) {
        const segmentText = scene.narration[slot.index]!.text;
        const hits = findPhrase(tokenizeWords(segmentText), phrase);
        if (hits.length === 0) continue;
        const hit = hits[Math.min(anchorNth(line.after), hits.length) - 1]!;
        const lastWord = slot.data.words[hit + phraseLength - 1] ?? slot.data.words[hit];
        startSeconds = slot.startSeconds + (lastWord?.end ?? 0) + 0.15;
        break;
      }
      if (startSeconds === undefined) {
        throw new Error(
          `Scene "${scene.id}": line ${index + 1} anchors after ${JSON.stringify(phrase)}, which no narration segment contains`,
        );
      }
      filmLines.push({
        key,
        hash: data.hash,
        speaker: line.speaker,
        text: line.say,
        startTick: secondsToTicks(startSeconds),
        durationTicks: secondsToTicks(data.durationSeconds),
      });
      linesEndSeconds = Math.max(linesEndSeconds, startSeconds + data.durationSeconds);
      markers.push({
        sceneId: scene.id,
        kind: 'sync',
        label: `line(${line.speaker}): ${line.say}`,
        seconds: ticksToSeconds(filmTick) + startSeconds,
        tick: filmTick + secondsToTicks(startSeconds),
      });
    });

    const durationTicks =
      scene.duration !== undefined
        ? secondsToTicks(scene.duration)
        : secondsToTicks(Math.max(narrationSeconds, linesEndSeconds + 0.35));
    if (durationTicks <= 0) {
      throw new Error(`Scene "${scene.id}": empty duration`);
    }

    // -- stage preset (M8.1): decor + ground behind everything ---------------
    const stagePreset = scene.stage ? STAGE_PRESETS[scene.stage.preset] : undefined;
    const stageInstances: FilmInstance[] = stagePreset
      ? [
          {
            id: 'stage-ground',
            shape: { kind: 'rect', width: (width / height) * 10 + 8, height: 6 },
            fill: { color: parseColor(stagePreset.ground) },
            depth: 0.9,
            layer: -1500,
          },
          ...stagePreset.decor.map((decor, di): FilmInstance => ({
            id: decor.id,
            object: {
              spec: decor.spec,
              options: { idPrefix: decor.id, layerBase: -2000 + di * 10 },
            },
            depth: decor.depth,
            layer: -2000 + di * 10,
          })),
        ]
      : [];
    const stagePositions = new Map<string, Vec2>(
      stagePreset
        ? [
            ['stage-ground', vec2(0, stagePreset.groundY - 3)],
            ...stagePreset.decor.map((decor): [string, Vec2] => [decor.id, vec2(...decor.at)]),
          ]
        : [],
    );

    // -- instances -------------------------------------------------------------
    const placedMaps = new Map<string, MapData>();
    const authoredInstances: FilmInstance[] = scene.place.map((p) => {
      if (doc.maps[p.ref]) {
        const entry = maps?.map(p.ref);
        if (!entry) {
          throw new Error(
            `Scene "${scene.id}": map "${p.ref}" needs compiled map data — the CLI builds it from assets/geodata`,
          );
        }
        placedMaps.set(p.as, entry);
        return {
          id: p.as,
          object: {
            spec: entry.objectSpec,
            options: {
              idPrefix: p.as,
              layerBase: (p.layer ?? 0) * 1000,
              flip: p.flip,
              tint: p.tint ? parseColor(p.tint) : undefined,
            },
          },
          depth: p.depth ?? 0.5,
          layer: (p.layer ?? 0) * 1000,
        };
      }
      const castDef = doc.cast[p.ref];
      if (castDef) {
        const palette: Record<string, Color> = {};
        for (const [slot, hex] of Object.entries(castDef.palette ?? {})) {
          if (hex !== undefined) palette[CAST_SLOT_NAMES[slot] ?? slot] = parseColor(hex);
        }
        return {
          id: p.as,
          character: {
            template: castDef.template,
            size: castDef.size ?? 1,
            palette,
            facing: p.facing ?? 'right',
            expression: castDef.expression ?? 'neutral',
            costume: castDef.costume ?? [],
            mustache: castDef.mustache,
            held: castDef.held,
            mount: p.on,
          },
          depth: p.depth ?? 0.5,
          layer: (p.layer ?? 0) * 1000,
        };
      }
      const objectDef = doc.objects[p.ref];
      if (objectDef) {
        const overrides: Record<string, Color> = {};
        for (const [name, hex] of Object.entries(p.with ?? {})) overrides[name] = parseColor(hex);
        return {
          id: p.as,
          object: {
            spec: toObjectSpec(objectDef),
            options: {
              idPrefix: p.as,
              layerBase: (p.layer ?? 0) * 1000,
              params: overrides,
              flip: p.flip,
              tint: p.tint ? parseColor(p.tint) : undefined,
            },
          },
          depth: p.depth ?? 0.5,
          layer: (p.layer ?? 0) * 1000,
        };
      }
      const def = doc.shapes[p.ref]!;
      return {
        id: p.as,
        shape: toCoreShape(def),
        fill: toFill(def),
        stroke: toStroke(def),
        depth: p.depth ?? 0.5,
        layer: (p.layer ?? 0) * 1000,
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
      text?: string,
    ): void => {
      effects.push({
        target,
        verb: verbName,
        startTick,
        durationTicks: secondsToTicks(durationSeconds),
        params,
        ...(text !== undefined ? { text } : {}),
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
      hinge: 0.6,
      oscillate: 2,
      piston: 2,
      roll: 1,
      hearts: 1.2,
      react: 1.4,
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

    // Line reactions ride the delivery window (M8.4).
    scene.lines.forEach((line, index) => {
      if (!line.react) return;
      const fl = filmLines[index]!;
      pushEffect(line.speaker, 'react', fl.startTick, ticksToSeconds(fl.durationTicks) + 0.4, {
        kind: REACTION_CHOICES.indexOf(line.react),
      });
    });

    const baseOf = (target: string) => scene.place.find((p) => p.as === target)!;
    /** Entrances start offstage: overrides the pos track's initial value. */
    const basePosOverride = new Map<string, Vec2>();
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
      } else if (verb.hearts) {
        simpleFx('hearts', verb.hearts, startTick, ['count']);
      } else if (verb.arrow) {
        const a = verb.arrow;
        const [instName, entry] = resolveMapTarget(scene.id, placedMaps, a.target);
        const point = (endpoint: string | [number, number]): Vec2 =>
          resolveMapPoint(scene.id, instName, entry, endpoint);
        const fromPoint = point(a.from);
        const color = parseColor(a.color ?? '#b5453c');
        const toList: (string | [number, number])[] =
          typeof a.to === 'string'
            ? [a.to]
            : typeof a.to[0] === 'number'
              ? [a.to as [number, number]]
              : (a.to as (string | [number, number])[]);
        toList.forEach((destination, i) => {
          const toPoint = point(destination);
          pushEffect(
            instName,
            'map-arrow',
            // Offensive arrows launch with a small stagger.
            startTick + secondsToTicks(i * 0.15),
            a.duration ?? 0.9,
            {
              x0: fromPoint.x,
              y0: fromPoint.y,
              x1: toPoint.x,
              y1: toPoint.y,
              color: (color.r << 16) | (color.g << 8) | color.b,
              ...(a.width !== undefined ? { width: a.width } : {}),
              // Alternate bows so a fan of arrows reads organic.
              bow: a.bow ?? (i % 2 === 0 ? 0.16 : -0.14),
            },
          );
        });
      } else if (verb.bonk) {
        const { target, duration } = verb.bonk;
        const seconds = duration ?? 0.7;
        pushEffect(target, 'bonk', startTick, seconds, {});
        pushEffect(target, 'impact-stars', startTick, 0.6, { count: 6 });
      } else if (verb.fling) {
        const { target, to, duration, height, spins } = verb.fling;
        const from = lastPos.get(target) ?? vec2(...baseOf(target).at);
        const toVec = vec2(...to);
        const seconds = duration ?? 0.9;
        (posClips.get(target) ?? posClips.set(target, []).get(target)!).push({
          start: startTick,
          duration: secondsToTicks(seconds),
          from,
          to: toVec,
          easing: 'linear',
        });
        lastPos.set(target, toVec);
        pushEffect(target, 'fling', startTick, seconds, {
          ...(height !== undefined ? { height } : {}),
          ...(spins !== undefined ? { spins } : {}),
        });
      } else if (verb['squash-land']) {
        const { target, duration } = verb['squash-land'];
        pushEffect(target, 'squash-land', startTick, duration ?? 0.5, {});
      } else if (verb.chase) {
        // Two actors ping-pong across the stage in bounce-to legs, the
        // pursuer trailing by a beat (M8.5).
        const { targets, duration, span } = verb.chase;
        const [runner, chaser] = targets;
        const width2 = (span ?? 9) / 2;
        const seconds = duration ?? 4.4;
        const legSeconds = 2.2;
        const legs = Math.max(2, Math.round(seconds / legSeconds));
        const chaseTargets: [string, number][] = [
          [runner, 0],
          [chaser, 0.35],
        ];
        for (const [who, delay] of chaseTargets) {
          const baseY = (lastPos.get(who) ?? vec2(...baseOf(who).at)).y;
          let x = (lastPos.get(who) ?? vec2(...baseOf(who).at)).x;
          for (let leg = 0; leg < legs; leg++) {
            const gap = who === chaser ? 1.1 : 0;
            const destination = (leg % 2 === 0 ? width2 : -width2) - gap * (leg % 2 === 0 ? 1 : -1);
            const legStart = startTick + secondsToTicks(delay + leg * legSeconds);
            (posClips.get(who) ?? posClips.set(who, []).get(who)!).push({
              start: legStart,
              duration: secondsToTicks(legSeconds - 0.05),
              from: vec2(x, baseY),
              to: vec2(destination, baseY),
              easing: 'linear',
            });
            pushEffect(who, 'bounce-bob', legStart, legSeconds - 0.05, {
              hops: Math.max(3, Math.round(Math.abs(destination - x) / 1.4)),
              height: 0.4,
            });
            x = destination;
          }
          lastPos.set(who, vec2(x, baseY));
        }
      } else if (verb.gesture) {
        const g = verb.gesture;
        /** Defaults mirror motion's GESTURE_DEFAULT_SECONDS (M12.5 checks). */
        const GESTURE_SECONDS: Record<string, number> = {
          point: 1.4,
          wave: 1.6,
          salute: 1.3,
          facepalm: 1.7,
          shrug: 1.4,
          clap: 1.6,
          nod: 1.2,
          'shake-head': 1.2,
          bow: 1.6,
        };
        pushEffect(g.target, 'gesture', startTick, g.duration ?? GESTURE_SECONDS[g.kind] ?? 1.4, {
          kind: GESTURE_CHOICES.indexOf(g.kind),
        });
      } else if (verb.posture) {
        const p2 = verb.posture;
        const POSTURE_KIND_NAMES = ['sit', 'kneel', 'lie-down', 'stand'];
        pushEffect(p2.target, 'posture', startTick, p2.duration ?? 0.5, {
          kind: Math.max(0, POSTURE_KIND_NAMES.indexOf(p2.kind)),
        });
      } else if (verb.enter) {
        const { target, from, duration } = verb.enter;
        const at = lastPos.get(target) ?? vec2(...baseOf(target).at);
        const wingX = ((width / height) * 10) / 2 + 2;
        const offstage = vec2(from === 'left' ? -wingX : wingX, at.y);
        basePosOverride.set(target, offstage);
        const seconds = duration ?? 0.8;
        (posClips.get(target) ?? posClips.set(target, []).get(target)!).push({
          start: startTick,
          duration: secondsToTicks(seconds),
          from: offstage,
          to: at,
          easing: 'linear',
        });
        lastPos.set(target, at);
        pushEffect(target, 'bounce-bob', startTick, seconds, {
          hops: Math.max(2, Math.round(Math.abs(at.x - offstage.x) / 1.6)),
          height: 0.35,
        });
      } else if (verb.exit) {
        const { target, to, duration } = verb.exit;
        const from = lastPos.get(target) ?? vec2(...baseOf(target).at);
        const wingX = ((width / height) * 10) / 2 + 2;
        const offstage = vec2(to === 'left' ? -wingX : wingX, from.y);
        const seconds = duration ?? 0.7;
        (posClips.get(target) ?? posClips.set(target, []).get(target)!).push({
          start: startTick,
          duration: secondsToTicks(seconds),
          from,
          to: offstage,
          easing: 'linear',
        });
        lastPos.set(target, offstage);
        pushEffect(target, 'bounce-bob', startTick, seconds, {
          hops: Math.max(2, Math.round(Math.abs(offstage.x - from.x) / 1.6)),
          height: 0.35,
        });
      } else if (verb.label) {
        const l = verb.label;
        const [instName, entry] = resolveMapTarget(scene.id, placedMaps, l.target);
        for (const [target, text] of Object.entries(l.of)) {
          const ids = entry.groups[target] ?? [target];
          const points = ids.map((id) => resolveMapPoint(scene.id, instName, entry, id));
          // A group's nameplate sits at the mean of its member centroids.
          const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
          const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
          pushEffect(
            instName,
            'map-label',
            startTick,
            0.4,
            { x: cx, y: cy, size: l.size ?? 0.34 },
            text,
          );
        }
      } else if (verb['zoom-to']) {
        const zt = verb['zoom-to'];
        const [instName, entry] = resolveMapTarget(scene.id, placedMaps, zt.target);
        const region = entry.regions.find((r) => r.id === zt.region);
        if (!region) {
          throw new Error(
            `Scene "${scene.id}": zoom-to region "${zt.region}" is not on map "${instName}"`,
          );
        }
        const placement = scene.place.find((p) => p.as === instName)!;
        const margin = zt.margin ?? 1.2;
        const boxW = region.bbox.max.x - region.bbox.min.x + margin * 2;
        const boxH = region.bbox.max.y - region.bbox.min.y + margin * 2;
        const worldW = (width / height) * 10;
        const zoomLevel = Math.max(0.5, Math.min(6, Math.min(10 / boxH, worldW / boxW)));
        const to = vec2(
          placement.at[0] + (region.bbox.min.x + region.bbox.max.x) / 2,
          placement.at[1] + (region.bbox.min.y + region.bbox.max.y) / 2,
        );
        const clipTicks = secondsToTicks(zt.duration ?? 1.2);
        const easing = zt.easing ?? 'cubicInOut';
        cameraPosClips.push({
          start: startTick,
          duration: clipTicks,
          from: lastCameraPos,
          to,
          easing,
        });
        lastCameraPos = to;
        cameraZoomClips.push({
          start: startTick,
          duration: clipTicks,
          from: lastCameraZoom,
          to: zoomLevel,
          easing,
        });
        lastCameraZoom = zoomLevel;
      } else if (verb.march) {
        const m = verb.march;
        const [instName, entry] = resolveMapTarget(scene.id, placedMaps, m.target);
        const fromPoint = resolveMapPoint(scene.id, instName, entry, m.from);
        const toPoint = resolveMapPoint(scene.id, instName, entry, m.to);
        pushEffect(instName, 'map-march', startTick, m.duration ?? 2.4, {
          x0: fromPoint.x,
          y0: fromPoint.y,
          x1: toPoint.x,
          y1: toPoint.y,
          kind: Math.max(0, UNIT_KIND_NAMES.indexOf(m.kind ?? 'infantry')),
          count: m.count ?? 5,
          color: packHex(m.color ?? '#4a4136'),
          bow: m.bow ?? 0.12,
        });
      } else if (verb.battle) {
        const b = verb.battle;
        const [instName, entry] = resolveMapTarget(scene.id, placedMaps, b.target);
        const at = resolveMapPoint(scene.id, instName, entry, b.at);
        pushEffect(instName, 'map-battle', startTick, b.duration ?? 1.4, { x: at.x, y: at.y });
      } else if (verb['plant-flag']) {
        const f = verb['plant-flag'];
        const [instName, entry] = resolveMapTarget(scene.id, placedMaps, f.target);
        const at = resolveMapPoint(scene.id, instName, entry, f.at);
        pushEffect(instName, 'map-flag', startTick, 1.2, {
          x: at.x,
          y: at.y,
          color: packHex(f.color ?? '#b5453c'),
        });
      } else if (verb.map) {
        const m = verb.map;
        const [instName, entry] = resolveMapTarget(scene.id, placedMaps, m.target);
        const expand = (target: string): readonly string[] => {
          const members = entry.groups[target];
          if (members) return members;
          if (entry.regions.some((r) => r.id === target)) return [target];
          throw new Error(
            `Scene "${scene.id}": unknown map region/group "${target}" on "${instName}"`,
          );
        };
        const pack = (hex: string): number => {
          const c = parseColor(hex);
          return (c.r << 16) | (c.g << 8) | c.b;
        };
        if (m.recolor) {
          for (const [target, hex] of Object.entries(m.recolor)) {
            expand(target).forEach((regionId, i) => {
              // Alliance members sweep in with a small stagger.
              pushEffect(
                `${instName}.${regionId}`,
                'map-recolor',
                startTick + secondsToTicks(i * 0.12),
                m.duration ?? 0.6,
                { color: pack(hex) },
              );
            });
          }
        }
        if (m.highlight) {
          for (const regionId of expand(m.highlight)) {
            pushEffect(
              `${instName}.${regionId}`,
              'map-highlight',
              startTick,
              m.duration ?? 1.2,
              {},
            );
          }
        }
        if (m.morph) {
          const toIndex = entry.objectSpec.parts.findIndex((part) => part.id === m.morph!.to);
          if (toIndex < 0) {
            throw new Error(
              `Scene "${scene.id}": morph target region "${m.morph.to}" is not on map "${instName}"`,
            );
          }
          expand(m.morph.region); // validates the source region exists
          pushEffect(`${instName}.${m.morph.region}`, 'map-morph', startTick, m.duration ?? 0.8, {
            to: toIndex,
          });
        }
      } else if (verb.react) {
        const { target, kind, duration } = verb.react;
        const seconds = duration ?? EFFECT_DEFAULT_SECONDS.react!;
        pushEffect(target, 'react', startTick, seconds, {
          kind: REACTION_CHOICES.indexOf(kind),
        });
        // Emitter reactions bring their particles along.
        if (kind === 'sweat') pushEffect(target, 'sweat', startTick, seconds, {});
        if (kind === 'anger-steam') pushEffect(target, 'steam', startTick, seconds, {});
        if (kind === 'hearts') pushEffect(target, 'hearts', startTick, seconds, {});
      } else if (verb.hinge) {
        const { target, to, from, duration } = verb.hinge;
        pushEffect(target, 'hinge', startTick, duration ?? EFFECT_DEFAULT_SECONDS.hinge!, {
          to: degToRad(to),
          ...(from !== undefined ? { from: degToRad(from) } : {}),
        });
      } else if (verb.oscillate) {
        const { target, amplitude, cycles, duration } = verb.oscillate;
        pushEffect(target, 'oscillate', startTick, duration ?? EFFECT_DEFAULT_SECONDS.oscillate!, {
          ...(amplitude !== undefined ? { amplitude: degToRad(amplitude) } : {}),
          ...(cycles !== undefined ? { cycles } : {}),
        });
      } else if (verb.piston) {
        const { target, axis, amplitude, cycles, duration } = verb.piston;
        pushEffect(target, 'piston', startTick, duration ?? EFFECT_DEFAULT_SECONDS.piston!, {
          axis: axis === 'y' ? 1 : 0,
          ...(amplitude !== undefined ? { amplitude } : {}),
          ...(cycles !== undefined ? { cycles } : {}),
        });
      } else if (verb.roll) {
        const { target, radius, duration } = verb.roll;
        pushEffect(target, 'roll', startTick, duration ?? EFFECT_DEFAULT_SECONDS.roll!, { radius });
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
    // Stage decor is static: base-value tracks only.
    for (const [id, at] of stagePositions) {
      tracks.push(
        createTrack<Vec2>(`${id}/pos`, at, [], lerpVec2),
        createTrack<number>(`${id}/rot`, 0, [], lerp),
        createTrack<number>(`${id}/scale`, 1, [], lerp),
        createTrack<number>(`${id}/travel`, 0, [], lerp),
      );
    }
    for (const p of scene.place) {
      tracks.push(
        createTrack<Vec2>(
          `${p.as}/pos`,
          basePosOverride.get(p.as) ?? vec2(...p.at),
          posClips.get(p.as) ?? [],
          lerpVec2,
        ),
        createTrack<number>(`${p.as}/rot`, degToRad(p.rotate ?? 0), rotClips.get(p.as) ?? [], lerp),
        createTrack<number>(`${p.as}/scale`, p.scale ?? 1, scaleClips.get(p.as) ?? [], lerp),
      );
      // Cumulative path length in world units — drives roll (ω = v/r).
      let travelled = 0;
      const travelClips: Clip<number>[] = [];
      for (const clip of [...(posClips.get(p.as) ?? [])].sort((a, b) => a.start - b.start)) {
        const length = Math.hypot(clip.to.x - clip.from.x, clip.to.y - clip.from.y);
        travelClips.push({
          start: clip.start,
          duration: clip.duration,
          from: travelled,
          to: travelled + length,
          easing: clip.easing,
        });
        travelled += length;
      }
      tracks.push(createTrack<number>(`${p.as}/travel`, 0, travelClips, lerp));
    }
    tracks.push(
      createTrack<Vec2>('camera/pos', vec2(0, 0), cameraPosClips, lerpVec2),
      createTrack<number>('camera/zoom', 1, cameraZoomClips, lerp),
    );

    // Authored backdrop wins; otherwise the stage preset's.
    const backdrop =
      scene.backdrop === undefined
        ? stagePreset
          ? {
              top: parseColor(stagePreset.backdrop.top),
              bottom: parseColor(stagePreset.backdrop.bottom),
            }
          : undefined
        : typeof scene.backdrop === 'string'
          ? { top: parseColor(scene.backdrop), bottom: parseColor(scene.backdrop) }
          : { top: parseColor(scene.backdrop.top), bottom: parseColor(scene.backdrop.bottom) };

    const compiled: FilmScene = {
      id: scene.id,
      backdrop,
      startTick: filmTick,
      durationTicks,
      narration,
      effects,
      cards,
      lines: filmLines,
      instances: [...stageInstances, ...authoredInstances],
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

/**
 * The motion-graphics verb registry (M4.1, ADR-0008). Every verb declares
 * its docs, default duration, default SFX, and a pure sampler:
 * (t ∈ [0,1], params, effect, filmSeed) → Pose. The registry is the single
 * source of truth the engine executes, the validator checks against, and
 * `mf spec` documents (M12.5).
 *
 * Conventions: `t` is normalized effect time; params are flat numbers
 * (schema-checked in lang); all randomness is pure hash noise keyed by the
 * effect's seed stream — same film seed → same wiggle, every render.
 */

import {
  ease,
  hashNoiseSigned,
  vec2,
  type FilmEffect,
  type Pose,
  type SceneNode,
} from '@motionforge/core';

import { FX_DEFS } from './fx.js';

export interface VerbDef {
  readonly name: string;
  readonly summary: string;
  /** Default effect duration, seconds. */
  readonly defaultDurationSeconds: number;
  /** SFX cue name emitted by default when the audio bus lands (M9). */
  readonly defaultSfx?: string;
  /** Hide the target before the effect starts (entrances). */
  readonly hideBefore?: boolean;
  /** Hide the target after the effect ends (exits). */
  readonly hideAfter?: boolean;
  /** Hide the target from effect start onward (explode). */
  readonly hideTargetFromStart?: boolean;
  /** Keep the t=1 pose after the effect ends (hinge holds its angle). */
  readonly holdAfter?: boolean;
  readonly sample: (t: number, effect: FilmEffect, filmSeed: number) => Pose;
  /** Extra geometry in target-local world units (cartoon FX). */
  readonly emit?: (t: number, effect: FilmEffect, filmSeed: number) => SceneNode[];
}

const p = (effect: FilmEffect, key: string, fallback: number): number =>
  effect.params[key] ?? fallback;

/** Overshoot curve: 0 → 1 with a configurable bounce past 1. */
const overshoot = (t: number): number => ease('backOut', t);

const defs: VerbDef[] = [
  {
    name: 'pop-in',
    summary: 'Scale from nothing with overshoot — the genre entrance.',
    defaultDurationSeconds: 0.4,
    defaultSfx: 'pop',
    hideBefore: true,
    sample(t, effect) {
      const s = overshoot(t) * p(effect, 'to', 1);
      return { scale: vec2(s, s) };
    },
  },
  {
    name: 'pop-out',
    summary: 'Shrink to nothing (slight inhale first) — the genre exit.',
    defaultDurationSeconds: 0.3,
    defaultSfx: 'pop',
    hideAfter: true,
    sample(t) {
      const s = t < 0.25 ? 1 + 0.15 * (t / 0.25) : Math.max(0, 1.15 * (1 - (t - 0.25) / 0.75));
      return { scale: vec2(s, s) };
    },
  },
  {
    name: 'spin-in',
    summary: 'Entrance: spin up from nothing while rotating in.',
    defaultDurationSeconds: 0.5,
    defaultSfx: 'whoosh',
    hideBefore: true,
    sample(t, effect) {
      const s = overshoot(t);
      const turns = p(effect, 'turns', 1);
      return { scale: vec2(s, s), rotate: (1 - ease('cubicOut', t)) * turns * -2 * Math.PI };
    },
  },
  {
    name: 'slam',
    summary: 'Drop from above and squash on impact. Pairs with camera shake.',
    defaultDurationSeconds: 0.45,
    defaultSfx: 'slam',
    hideBefore: true,
    sample(t, effect) {
      const height = p(effect, 'height', 4);
      const impact = 0.6; // fraction of the effect spent falling
      if (t < impact) {
        const fall = ease('quadIn', t / impact);
        return { translate: vec2(0, height * (1 - fall)) };
      }
      // Squash on landing, then recover.
      const u = (t - impact) / (1 - impact);
      const squash = Math.sin(Math.PI * u) * 0.35;
      return { scale: vec2(1 + squash, 1 - squash) };
    },
  },
  {
    name: 'wiggle',
    summary: 'Seeded angular jitter — nervous energy on any node.',
    defaultDurationSeconds: 0.8,
    sample(t, effect, filmSeed) {
      const amplitude = p(effect, 'amplitude', 0.12);
      const step = Math.floor(t * p(effect, 'speed', 14));
      const fade = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
      return { rotate: hashNoiseSigned(filmSeed, effect.seed, step) * amplitude * fade };
    },
  },
  {
    name: 'pulse',
    summary: 'One smooth scale beat — emphasis without leaving the spot.',
    defaultDurationSeconds: 0.5,
    defaultSfx: 'boink',
    sample(t, effect) {
      const s = 1 + Math.sin(Math.PI * t) * (p(effect, 'to', 1.25) - 1);
      return { scale: vec2(s, s) };
    },
  },
  {
    name: 'shake',
    summary: 'Seeded camera/node shake with decay (slam aftermath).',
    defaultDurationSeconds: 0.4,
    sample(t, effect, filmSeed) {
      const intensity = p(effect, 'intensity', 0.3);
      const decay = (1 - t) * (1 - t);
      const step = Math.floor(t * 40);
      return {
        translate: vec2(
          hashNoiseSigned(filmSeed, `${effect.seed}/x`, step) * intensity * decay,
          hashNoiseSigned(filmSeed, `${effect.seed}/y`, step) * intensity * decay,
        ),
      };
    },
  },
  {
    name: 'hinge',
    summary: 'Rotate a part about its pivot to a target angle and hold (M5.3).',
    defaultDurationSeconds: 0.6,
    holdAfter: true,
    sample(t, effect) {
      const from = p(effect, 'from', 0);
      const to = p(effect, 'to', Math.PI / 2);
      return { rotate: from + (to - from) * ease('cubicInOut', t) };
    },
  },
  {
    name: 'oscillate',
    summary: 'Continuous angular swing about the pivot (pendulums, levers).',
    defaultDurationSeconds: 2,
    sample(t, effect) {
      const amplitude = p(effect, 'amplitude', 0.4);
      const cycles = p(effect, 'cycles', 2);
      return { rotate: amplitude * Math.sin(2 * Math.PI * cycles * t) };
    },
  },
  {
    name: 'piston',
    summary: 'Linear reciprocation along an axis (pumps, pistons).',
    defaultDurationSeconds: 2,
    sample(t, effect) {
      const amplitude = p(effect, 'amplitude', 0.3);
      const cycles = p(effect, 'cycles', 2);
      const axis = p(effect, 'axis', 0); // 0 = x, 1 = y
      const d = amplitude * Math.sin(2 * Math.PI * cycles * t);
      return { translate: axis === 0 ? vec2(d, 0) : vec2(0, d) };
    },
  },
  {
    name: 'roll',
    summary: 'Wheel rotation from distance travelled (ω = v/r) — the frame builder feeds travel.',
    defaultDurationSeconds: 1,
    sample(t, effect) {
      // `travel` is injected by the frame builder from the travel track.
      const radius = Math.max(0.01, p(effect, 'radius', 0.35));
      return { rotate: -p(effect, 'travel', 0) / radius };
    },
  },
  {
    name: 'squash-stretch',
    summary: 'Volume-preserving squash/stretch beats on any node (M4.4).',
    defaultDurationSeconds: 0.6,
    sample(t, effect) {
      const amount = p(effect, 'amount', 0.25);
      const beats = Math.max(1, Math.round(p(effect, 'beats', 1)));
      const fade = Math.sin(Math.PI * t);
      const sx = 1 + amount * Math.sin(2 * Math.PI * beats * t) * fade;
      return { scale: vec2(sx, 1 / sx) };
    },
  },
  {
    name: 'bounce-bob',
    summary: 'Hop bob layered on a linear slide — the bounce-to gait (M4.2).',
    defaultDurationSeconds: 1,
    sample(t, effect) {
      const hops = Math.max(1, Math.round(p(effect, 'hops', 3)));
      const height = p(effect, 'height', 0.45);
      const phase = t * hops * Math.PI;
      const lift = Math.abs(Math.sin(phase)) * height;
      // Squash briefly at each landing (phase near a multiple of π).
      const nearLanding = Math.abs(Math.sin(phase)) < 0.18 && t > 0.02 && t < 0.98;
      const squash = nearLanding ? 0.18 : 0;
      return { translate: vec2(0, lift), scale: vec2(1 + squash, 1 - squash) };
    },
  },
  {
    name: 'react',
    summary:
      'Face takeover on a cast member (jaw-drop, eye-bulge, …). The frame ' +
      'builder reads `kind` and drives the face; the body pose is untouched.',
    defaultDurationSeconds: 1.4,
    sample: () => ({}),
  },
  // Map region verbs (M7.3) target `map-instance.region` and are drawn by
  // the frame builder from the map's part geometry; poses stay identity.
  {
    name: 'map-recolor',
    summary: 'Territory recolor: the new color sweeps across the region and stays.',
    defaultDurationSeconds: 0.6,
    holdAfter: true,
    sample: () => ({}),
  },
  {
    name: 'map-highlight',
    summary: 'Pulse a region with a warm wash — "look here".',
    defaultDurationSeconds: 1.2,
    sample: () => ({}),
  },
  {
    name: 'map-morph',
    summary: 'Border change: the region morphs into another named shape and stays.',
    defaultDurationSeconds: 0.8,
    holdAfter: true,
    sample: () => ({}),
  },
  {
    name: 'map-arrow',
    summary: 'A fat curved offensive arrow grows across the map and stays.',
    defaultDurationSeconds: 0.9,
    holdAfter: true,
    sample: () => ({}),
  },
];

export type VerbRegistry = ReadonlyMap<string, VerbDef>;

export const VERB_REGISTRY: VerbRegistry = new Map([...defs, ...FX_DEFS].map((d) => [d.name, d]));

export function verb(name: string): VerbDef {
  const def = VERB_REGISTRY.get(name);
  if (!def) throw new Error(`Unknown motion verb ${JSON.stringify(name)}`);
  return def;
}

/**
 * Sample the pose an effect contributes at a scene-local tick, including
 * entrance/exit visibility. Pure.
 */
export function sampleEffect(effect: FilmEffect, localTick: number, filmSeed: number): Pose {
  const def = verb(effect.verb);
  const end = effect.startTick + effect.durationTicks;
  if (localTick < effect.startTick) {
    return def.hideBefore ? { opacity: 0 } : {};
  }
  if (def.hideTargetFromStart) return { opacity: 0 };
  if (localTick >= end) {
    if (def.holdAfter) return def.sample(1, effect, filmSeed);
    return def.hideAfter ? { opacity: 0 } : {};
  }
  const t = effect.durationTicks === 0 ? 1 : (localTick - effect.startTick) / effect.durationTicks;
  return def.sample(t, effect, filmSeed);
}

/**
 * Geometry emitted by an effect at a scene-local tick (empty outside its
 * window or for non-emitting verbs). Pure.
 */
export function emitEffectNodes(
  effect: FilmEffect,
  localTick: number,
  filmSeed: number,
): SceneNode[] {
  const def = verb(effect.verb);
  if (!def.emit) return [];
  const end = effect.startTick + effect.durationTicks;
  if (localTick < effect.startTick || localTick >= end) return [];
  const t = effect.durationTicks === 0 ? 1 : (localTick - effect.startTick) / effect.durationTicks;
  return def.emit(t, effect, filmSeed);
}

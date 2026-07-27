/**
 * Shatter + debris (M14.5, plan §5.7): the target fractures into a
 * seeded radial pattern of rigid shards that fly ballistically and
 * tumble, over a burst of fine dust. Geometry comes from the `emit`
 * hook like the M4.3 FX; every jitter is hash noise on the effect seed,
 * so the fracture is a pure function of (film, tick).
 */

import {
  hashNoise,
  hashNoiseSigned,
  parseColor,
  rotation,
  compose,
  translation,
  vec2,
  type Color,
  type FilmEffect,
  type SceneNode,
  type Vec2,
} from '@motionforge/core';

import type { VerbDef } from './verbs.js';

const p = (effect: FilmEffect, key: string, fallback: number): number =>
  effect.params[key] ?? fallback;

/** Default shard tone: fired terracotta (a vase's insides). */
const CERAMIC = parseColor('#b8663f');
const DUST = parseColor('#cdbfa8');
const FLASH = parseColor('#fff7dd');

const shade = (c: Color): Color => ({
  r: Math.round(c.r * 0.62),
  g: Math.round(c.g * 0.62),
  b: Math.round(c.b * 0.62),
  a: c.a,
});

export const SHATTER_DEFS: VerbDef[] = [
  {
    name: 'shatter',
    summary:
      'The target fractures into spinning shards and dust (M14.5). ' +
      'Seeded radial break pattern; the target stays gone.',
    defaultDurationSeconds: 1.1,
    defaultSfx: 'slam',
    hideTargetFromStart: true,
    sample: () => ({}),
    emit(t, effect, filmSeed) {
      const radius = p(effect, 'radius', 0.6);
      const count = Math.max(3, Math.round(p(effect, 'count', 8)));
      const fill: Color =
        effect.params.cr !== undefined
          ? { r: effect.params.cr, g: effect.params.cg ?? 0, b: effect.params.cb ?? 0, a: 1 }
          : CERAMIC;
      const dark = shade(fill);
      const nodes: SceneNode[] = [];

      // A brief pale crack-flash sells the instant of the break.
      if (t < 0.1) {
        nodes.push({
          id: `${effect.seed}/flash`,
          shape: { kind: 'circle', r: radius * (0.7 + 2.2 * t) },
          fill: { color: FLASH },
          opacity: (1 - t / 0.1) * 0.85,
        });
      }

      // Seeded radial fracture: jittered cut angles around the rim.
      const cuts: number[] = [];
      for (let i = 0; i < count; i++) {
        cuts.push(
          ((i + 0.5 * hashNoiseSigned(filmSeed, `${effect.seed}/cut`, i)) / count) * Math.PI * 2,
        );
      }
      const shardFade = Math.max(0, Math.min(1, (1 - t) / 0.35));
      for (let i = 0; i < count; i++) {
        const a0 = cuts[i]!;
        const a1 = cuts[(i + 1) % count]! + (i === count - 1 ? Math.PI * 2 : 0);
        const mid = (a0 + a1) / 2;
        const rim = radius * (0.85 + hashNoise(filmSeed, `${effect.seed}/rim`, i) * 0.3);
        // The shard polygon: a wedge from near the core to the rim.
        const core = 0.12 * radius;
        const points: Vec2[] = [
          vec2(Math.cos(mid) * core, Math.sin(mid) * core),
          vec2(Math.cos(a0) * rim * 0.92, Math.sin(a0) * rim * 0.92),
          vec2(Math.cos(mid) * rim * 1.08, Math.sin(mid) * rim * 1.08),
          vec2(Math.cos(a1) * rim * 0.92, Math.sin(a1) * rim * 0.92),
        ];
        // Rigid flight: radial toss with an upward bias, gravity, tumble.
        const speed = 1.6 + hashNoise(filmSeed, `${effect.seed}/spd`, i) * 2.2;
        const x = Math.cos(mid) * speed * t;
        const y = (Math.sin(mid) * 0.6 + 0.9) * speed * t - 5.5 * t * t;
        const spin = hashNoiseSigned(filmSeed, `${effect.seed}/spin`, i) * 7 * t;
        nodes.push({
          id: `${effect.seed}/shard${i}`,
          transform: compose(translation(x, y), rotation(spin)),
          shape: { kind: 'polygon', points },
          fill: { color: i % 3 === 2 ? dark : fill },
          stroke: { color: dark, width: 0.02 * radius + 0.008 },
          opacity: shardFade,
        });
      }

      // Fine dust riding the burst, gone before the shards.
      for (let i = 0; i < 12; i++) {
        const angle = hashNoise(filmSeed, `${effect.seed}/dusta`, i) * Math.PI * 2;
        const speed = 2 + hashNoise(filmSeed, `${effect.seed}/dusts`, i) * 2.5;
        const x = Math.cos(angle) * speed * t;
        const y = (Math.abs(Math.sin(angle)) * 0.8 + 0.4) * speed * t - 4.5 * t * t;
        nodes.push({
          id: `${effect.seed}/dust${i}`,
          transform: translation(x, y),
          shape: {
            kind: 'circle',
            r: radius * (0.05 + 0.04 * hashNoise(filmSeed, `${effect.seed}/dustr`, i)),
          },
          fill: { color: DUST },
          opacity: Math.max(0, 1 - t * 1.6),
        });
      }

      return nodes;
    },
  },
];

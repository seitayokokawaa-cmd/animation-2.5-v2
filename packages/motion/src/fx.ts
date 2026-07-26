/**
 * Cartoon FX verbs (M4.3, ADR-0008): explode, impact stars, speedlines,
 * sweat/steam emitters. Unlike emphasis verbs these EMIT geometry — the
 * `emit` hook returns SceneNodes in target-local world units, fully
 * deterministic via hash noise on the effect seed.
 */

import {
  hashNoise,
  hashNoiseSigned,
  parseColor,
  translation,
  vec2,
  type FilmEffect,
  type SceneNode,
} from '@motionforge/core';

import type { VerbDef } from './verbs.js';

const p = (effect: FilmEffect, key: string, fallback: number): number =>
  effect.params[key] ?? fallback;

const WHITE = parseColor('#ffffff');
const FLASH = parseColor('#fff3c4');
const PUFF = parseColor('#d8d3c8');
const DEBRIS = parseColor('#8a6a3f');
const STAR = parseColor('#ffd9a0');
const SWEAT = parseColor('#9fd0f0');
const STEAM = parseColor('#cfcfcf');
const HEART = parseColor('#e2596b');

/** Deterministic per-particle unit direction. */
const direction = (seed: number, stream: string, i: number): { x: number; y: number } => {
  const angle = hashNoise(seed, `${stream}/dir`, i) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

export const FX_DEFS: VerbDef[] = [
  {
    name: 'explode',
    summary:
      'The target bursts: flash, expanding smoke puffs, ballistic debris. Target stays gone.',
    defaultDurationSeconds: 0.8,
    defaultSfx: 'boom',
    hideTargetFromStart: true,
    sample: () => ({}),
    emit(t, effect, filmSeed) {
      const radius = p(effect, 'radius', 1.6);
      const nodes: SceneNode[] = [];
      if (t < 0.15) {
        nodes.push({
          id: `${effect.seed}/flash`,
          shape: { kind: 'circle', r: radius * (0.6 + 3 * t) },
          fill: { color: FLASH },
          opacity: 1 - t / 0.15,
        });
      }
      for (let i = 0; i < 8; i++) {
        const dir = direction(filmSeed, effect.seed, i);
        const spread = 0.5 + hashNoise(filmSeed, `${effect.seed}/spread`, i) * 0.8;
        const travel = Math.min(1, t * 1.6) * radius * spread;
        const grow = 0.25 + t * 0.6;
        nodes.push({
          id: `${effect.seed}/puff${i}`,
          transform: translation(dir.x * travel, dir.y * travel),
          shape: { kind: 'circle', r: grow * radius * 0.45 },
          fill: { color: PUFF },
          opacity: Math.max(0, 1 - t) * 0.9,
        });
      }
      for (let i = 0; i < 10; i++) {
        const dir = direction(filmSeed, `${effect.seed}/deb`, i);
        const speed = 3 + hashNoise(filmSeed, `${effect.seed}/spd`, i) * 3;
        const x = dir.x * speed * t;
        const y = Math.abs(dir.y) * speed * t - 6 * t * t; // gravity arc
        nodes.push({
          id: `${effect.seed}/debris${i}`,
          transform: translation(x, y),
          shape: {
            kind: 'polygon',
            points: [vec2(0, 0.14), vec2(0.12, -0.1), vec2(-0.12, -0.1)],
          },
          fill: { color: DEBRIS },
          opacity: Math.max(0, 1 - t * 1.2),
        });
      }
      return nodes;
    },
  },
  {
    name: 'impact-stars',
    summary: 'Little stars orbiting out from a bonk point.',
    defaultDurationSeconds: 0.6,
    defaultSfx: 'boink',
    sample: () => ({}),
    emit(t, effect, filmSeed) {
      const count = Math.max(1, Math.round(p(effect, 'count', 5)));
      const nodes: SceneNode[] = [];
      for (let i = 0; i < count; i++) {
        const base = (i / count) * Math.PI * 2 + hashNoise(filmSeed, effect.seed, i) * 0.8;
        const angle = base + t * 2.2;
        const dist = 0.5 + t * 1.1;
        const s = 0.16 * (1 - t * 0.5);
        nodes.push({
          id: `${effect.seed}/star${i}`,
          transform: translation(Math.cos(angle) * dist, Math.sin(angle) * dist),
          shape: {
            kind: 'polygon',
            points: [
              vec2(0, s * 2),
              vec2(s * 0.6, s * 0.6),
              vec2(s * 2, 0),
              vec2(s * 0.6, -s * 0.6),
              vec2(0, -s * 2),
              vec2(-s * 0.6, -s * 0.6),
              vec2(-s * 2, 0),
              vec2(-s * 0.6, s * 0.6),
            ],
          },
          fill: { color: STAR },
          opacity: Math.max(0, 1 - t),
        });
      }
      return nodes;
    },
  },
  {
    name: 'speedlines',
    summary: 'Trailing motion lines behind a fast mover.',
    defaultDurationSeconds: 0.6,
    defaultSfx: 'whoosh',
    sample: () => ({}),
    emit(t, effect, filmSeed) {
      // `angle` (degrees) points where the lines trail; default: behind-left.
      const angle = (p(effect, 'angle', 180) * Math.PI) / 180;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const nodes: SceneNode[] = [];
      for (let i = 0; i < 4; i++) {
        const flicker = hashNoise(filmSeed, effect.seed, i * 31 + Math.floor(t * 12));
        if (flicker < 0.25) continue;
        const off = (i - 1.5) * 0.4;
        const len = 0.9 + flicker;
        nodes.push({
          id: `${effect.seed}/line${i}`,
          transform: translation(dx * 0.8 - dy * off, dy * 0.8 + dx * off),
          shape: { kind: 'rect', width: len, height: 0.07 },
          fill: { color: WHITE },
          opacity: 0.5 * (1 - t),
        });
      }
      return nodes;
    },
  },
  {
    name: 'sweat',
    summary: 'Nervous droplets flung from the brow.',
    defaultDurationSeconds: 0.9,
    sample: () => ({}),
    emit(t, effect, filmSeed) {
      const count = Math.max(1, Math.round(p(effect, 'count', 3)));
      const nodes: SceneNode[] = [];
      for (let i = 0; i < count; i++) {
        const side = hashNoiseSigned(filmSeed, effect.seed, i) > 0 ? 1 : -1;
        const vx = side * (0.8 + hashNoise(filmSeed, `${effect.seed}/vx`, i));
        const phase = (t + i * 0.17) % 1;
        const x = vx * phase;
        const y = 0.7 + 1.6 * phase - 3.2 * phase * phase;
        nodes.push({
          id: `${effect.seed}/drop${i}`,
          transform: translation(x, y),
          shape: { kind: 'ellipse', rx: 0.09, ry: 0.13 },
          fill: { color: SWEAT },
          opacity: Math.max(0, 1 - phase),
        });
      }
      return nodes;
    },
  },
  {
    name: 'hearts',
    summary: 'Little hearts floating up — smitten (M6.7 reactions).',
    defaultDurationSeconds: 1.2,
    sample: () => ({}),
    emit(t, effect, filmSeed) {
      const count = Math.max(1, Math.round(p(effect, 'count', 4)));
      const nodes: SceneNode[] = [];
      for (let i = 0; i < count; i++) {
        const phase = (t + i / count) % 1;
        const sway = hashNoiseSigned(filmSeed, effect.seed, i) * 0.5;
        const s = 0.14 + hashNoise(filmSeed, `${effect.seed}/s`, i) * 0.08;
        nodes.push({
          id: `${effect.seed}/heart${i}`,
          transform: translation(
            sway + Math.sin(phase * Math.PI * 3 + i) * 0.15,
            0.7 + phase * 1.6,
          ),
          opacity: Math.max(0, 0.95 - phase),
          children: [
            {
              id: `${effect.seed}/heart${i}/l`,
              shape: { kind: 'circle', r: s * 0.62 },
              transform: translation(-s * 0.42, s * 0.3),
              fill: { color: HEART },
            },
            {
              id: `${effect.seed}/heart${i}/r`,
              shape: { kind: 'circle', r: s * 0.62 },
              transform: translation(s * 0.42, s * 0.3),
              fill: { color: HEART },
            },
            {
              id: `${effect.seed}/heart${i}/v`,
              shape: {
                kind: 'polygon',
                points: [vec2(-s, 0.16 * s), vec2(s, 0.16 * s), vec2(0, -s * 1.2)],
              },
              fill: { color: HEART },
            },
          ],
        });
      }
      return nodes;
    },
  },
  {
    name: 'steam',
    summary: 'Anger steam rising and dissolving.',
    defaultDurationSeconds: 1,
    sample: () => ({}),
    emit(t, effect, filmSeed) {
      const nodes: SceneNode[] = [];
      for (let i = 0; i < 3; i++) {
        const phase = (t + i * 0.33) % 1;
        const drift = hashNoiseSigned(filmSeed, effect.seed, i) * 0.4;
        nodes.push({
          id: `${effect.seed}/steam${i}`,
          transform: translation(drift * phase, 0.8 + phase * 1.4),
          shape: { kind: 'circle', r: 0.16 + phase * 0.28 },
          fill: { color: STEAM },
          opacity: 0.7 * (1 - phase),
        });
      }
      return nodes;
    },
  },
];

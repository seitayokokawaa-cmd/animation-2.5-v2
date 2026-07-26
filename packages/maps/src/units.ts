/**
 * Units and battles (M7.5, plan §5.2): little army silhouettes that march
 * in formation along a bezier path, clash bursts, and planted flags. All
 * geometry is map-local; the render tier drives t and places the nodes.
 *
 * Unit art: solid team-color silhouettes with an ink outline — readable at
 * map scale (≈0.5 world units), four kinds: infantry, cavalry, ship, plane.
 */

import {
  clamp,
  compose,
  hashNoise,
  rotation,
  scaling,
  translation,
  vec2,
  type Color,
  type SceneNode,
} from '@motionforge/core';

import { arrowSpine } from './arrows.js';

export const UNIT_KINDS = ['infantry', 'cavalry', 'ship', 'plane'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

const INK: Color = { r: 0x3a, g: 0x32, b: 0x26, a: 1 };

interface UnitPaint {
  readonly color: Color;
  readonly idPrefix: string;
}

/** One unit silhouette at the origin (feet/keel at y = 0), ~0.45 tall. */
export function unitNodes(kind: UnitKind, paint: UnitPaint): SceneNode[] {
  const { color, idPrefix: p } = paint;
  const ink = { color: INK, width: 0.018 };
  switch (kind) {
    case 'infantry':
      return [
        {
          id: `${p}/body`,
          shape: { kind: 'rect', width: 0.16, height: 0.24, rx: 0.06 },
          transform: translation(0, 0.16),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/helmet`,
          shape: { kind: 'ellipse', rx: 0.09, ry: 0.07 },
          transform: translation(0, 0.32),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/rifle`,
          shape: { kind: 'rect', width: 0.035, height: 0.3, rx: 0.017 },
          transform: compose(translation(0.1, 0.22), rotation(0.35)),
          fill: { color: INK },
        },
        {
          id: `${p}/leg-a`,
          shape: { kind: 'rect', width: 0.045, height: 0.09, rx: 0.02 },
          transform: translation(-0.045, 0.04),
          fill: { color: INK },
        },
        {
          id: `${p}/leg-b`,
          shape: { kind: 'rect', width: 0.045, height: 0.09, rx: 0.02 },
          transform: translation(0.045, 0.04),
          fill: { color: INK },
        },
      ];
    case 'cavalry':
      return [
        {
          id: `${p}/horse`,
          shape: { kind: 'ellipse', rx: 0.2, ry: 0.1 },
          transform: translation(0, 0.18),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/neck`,
          shape: { kind: 'rect', width: 0.07, height: 0.16, rx: 0.03 },
          transform: compose(translation(0.17, 0.28), rotation(-0.35)),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/head`,
          shape: { kind: 'ellipse', rx: 0.07, ry: 0.045 },
          transform: translation(0.24, 0.35),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/rider`,
          shape: { kind: 'circle', r: 0.06 },
          transform: translation(-0.03, 0.34),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/leg-a`,
          shape: { kind: 'rect', width: 0.04, height: 0.12, rx: 0.02 },
          transform: translation(-0.12, 0.05),
          fill: { color: INK },
        },
        {
          id: `${p}/leg-b`,
          shape: { kind: 'rect', width: 0.04, height: 0.12, rx: 0.02 },
          transform: translation(0.1, 0.05),
          fill: { color: INK },
        },
      ];
    case 'ship':
      return [
        {
          id: `${p}/hull`,
          shape: {
            kind: 'polygon',
            points: [vec2(-0.28, 0.12), vec2(0.3, 0.12), vec2(0.2, 0), vec2(-0.2, 0)],
          },
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/deck`,
          shape: { kind: 'rect', width: 0.24, height: 0.08, rx: 0.02 },
          transform: translation(-0.02, 0.16),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/funnel`,
          shape: { kind: 'rect', width: 0.06, height: 0.12, rx: 0.015 },
          transform: translation(0.02, 0.26),
          fill: { color: INK },
        },
        {
          id: `${p}/gun`,
          shape: { kind: 'rect', width: 0.14, height: 0.03, rx: 0.015 },
          transform: translation(0.16, 0.2),
          fill: { color: INK },
        },
      ];
    case 'plane':
      return [
        {
          id: `${p}/fuselage`,
          shape: { kind: 'ellipse', rx: 0.22, ry: 0.055 },
          transform: translation(0, 0.2),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/wing`,
          shape: { kind: 'ellipse', rx: 0.07, ry: 0.16 },
          transform: translation(0.0, 0.2),
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/tail`,
          shape: {
            kind: 'polygon',
            points: [vec2(-0.22, 0.2), vec2(-0.3, 0.3), vec2(-0.16, 0.24)],
          },
          fill: { color },
          stroke: ink,
        },
        {
          id: `${p}/prop`,
          shape: { kind: 'rect', width: 0.03, height: 0.14, rx: 0.015 },
          transform: translation(0.23, 0.2),
          fill: { color: INK },
        },
      ];
  }
}

export interface MarchOptions {
  readonly kind: UnitKind;
  readonly count: number;
  readonly color: Color;
  readonly bow: number;
  /** Formation spacing along the path, as a fraction of it. */
  readonly spacing?: number;
  readonly idPrefix: string;
  readonly seed: string;
  readonly filmSeed: number;
}

/**
 * The marching column at progress t: units in formation along the spine,
 * bobbing in counter-phase, with a dust trail behind the ground kinds.
 */
export function marchNodes(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
  options: MarchOptions,
): SceneNode[] {
  const spacing = options.spacing ?? 0.1;
  const nodes: SceneNode[] = [];
  const airborne = options.kind === 'plane';
  const afloat = options.kind === 'ship';
  const stepRate = options.kind === 'cavalry' ? 26 : 16;

  for (let i = 0; i < options.count; i++) {
    const s = clamp(t - i * spacing, 0, 1);
    if (s <= 0) continue;
    const p = arrowSpine(vec2(from.x, from.y), vec2(to.x, to.y), options.bow, s);
    const ahead = arrowSpine(
      vec2(from.x, from.y),
      vec2(to.x, to.y),
      options.bow,
      Math.min(1, s + 0.02),
    );
    const facingLeft = ahead.x < p.x;
    const marching = s < 1 && t - i * spacing < 1;
    const bob =
      airborne || !marching
        ? 0
        : Math.abs(Math.sin(s * Math.PI * stepRate + i * 1.7)) * (afloat ? 0.02 : 0.035);
    const sway = afloat && marching ? Math.sin(s * Math.PI * 10 + i) * 0.08 : 0;
    nodes.push({
      id: `${options.idPrefix}/u${i}`,
      transform: compose(
        compose(translation(p.x, p.y + bob + (airborne ? 0.5 : 0)), rotation(sway)),
        scaling(facingLeft ? -1 : 1, 1),
      ),
      children: unitNodes(options.kind, {
        color: options.color,
        idPrefix: `${options.idPrefix}/u${i}`,
      }),
    });
    // Dust puffs behind ground units while they move.
    if (!airborne && !afloat && marching && s > 0.03) {
      const back = arrowSpine(
        vec2(from.x, from.y),
        vec2(to.x, to.y),
        options.bow,
        Math.max(0, s - 0.03),
      );
      const puffPhase = (s * 14 + i * 0.6) % 1;
      const jitter = hashNoise(
        options.filmSeed,
        `${options.seed}/dust`,
        i * 31 + Math.floor(s * 14),
      );
      nodes.push({
        id: `${options.idPrefix}/dust${i}`,
        transform: translation(back.x, back.y + 0.05 + puffPhase * 0.08),
        opacity: 0.35 * (1 - puffPhase),
        shape: { kind: 'circle', r: 0.05 + 0.05 * puffPhase + jitter * 0.02 },
        fill: { color: { r: 0xcf, g: 0xc4, b: 0xac, a: 1 } },
      });
    }
  }
  return nodes;
}

/** Clash burst at a point: alternating star + rising smoke, looping. */
export function battleNodes(
  at: { x: number; y: number },
  t: number,
  idPrefix: string,
  seed: string,
  filmSeed: number,
): SceneNode[] {
  const nodes: SceneNode[] = [];
  const cycle = (t * 3) % 1;
  const star = (r: number, spikes: number, phase: number): { x: number; y: number }[] => {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? r : r * 0.45;
      const angle = (i / (spikes * 2)) * Math.PI * 2 + phase;
      points.push(vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
    }
    return points;
  };
  nodes.push({
    id: `${idPrefix}/burst`,
    transform: translation(at.x, at.y + 0.15),
    opacity: 0.85 * (1 - cycle * 0.5),
    shape: { kind: 'polygon', points: star(0.32 + cycle * 0.18, 8, cycle * 0.9) },
    fill: { color: { r: 0xff, g: 0xd9, b: 0xa0, a: 1 } },
    stroke: { color: INK, width: 0.02 },
  });
  for (let i = 0; i < 3; i++) {
    const phase = (t * 2 + i / 3) % 1;
    const drift = hashNoise(filmSeed, `${seed}/smoke`, i) - 0.5;
    nodes.push({
      id: `${idPrefix}/smoke${i}`,
      transform: translation(at.x + drift * 0.5 * phase, at.y + 0.3 + phase * 0.7),
      opacity: 0.5 * (1 - phase),
      shape: { kind: 'circle', r: 0.1 + phase * 0.14 },
      fill: { color: { r: 0xb9, g: 0xb2, b: 0xa4, a: 1 } },
    });
  }
  return nodes;
}

/** A planted flag: pole + two-frame waving pennant, popping in. */
export function flagNodes(
  at: { x: number; y: number },
  t: number,
  color: Color,
  idPrefix: string,
): SceneNode[] {
  const pop = t < 0.2 ? 1.25 * (t / 0.2) : t < 0.35 ? 1.25 - 0.25 * ((t - 0.2) / 0.15) : 1;
  if (pop <= 0) return [];
  const flap = Math.sin(t * Math.PI * 8) >= 0 ? 0 : 0.08;
  return [
    {
      id: `${idPrefix}/flag`,
      transform: compose(translation(at.x, at.y), scaling(pop, pop)),
      children: [
        {
          id: `${idPrefix}/pole`,
          shape: { kind: 'rect', width: 0.045, height: 0.85, rx: 0.02 },
          transform: translation(0, 0.42),
          fill: { color: { r: 0x5b, g: 0x42, b: 0x26, a: 1 } },
          stroke: { color: INK, width: 0.015 },
        },
        {
          id: `${idPrefix}/pennant`,
          shape: {
            kind: 'polygon',
            points: [
              vec2(0.02, 0.82),
              vec2(0.5, 0.76 - flap),
              vec2(0.36, 0.64 - flap / 2),
              vec2(0.5, 0.52 + flap),
              vec2(0.02, 0.5),
            ],
          },
          fill: { color },
          stroke: { color: INK, width: 0.02 },
        },
        {
          id: `${idPrefix}/finial`,
          shape: { kind: 'circle', r: 0.045 },
          transform: translation(0, 0.87),
          fill: { color: { r: 0xd4, g: 0xa9, b: 0x33, a: 1 } },
        },
      ],
    },
  ];
}

/**
 * The creature-builder (M14.2, plan §5.4): a parameterized template
 * factory in the same inked-cel stack as the potato and the quadrupeds —
 * body + optional head/beak, wings, tail fin, dorsal fin, stick legs.
 * Bird and fish ship as canned specs; new species are a spec away.
 *
 * Bone names follow the shared vocabulary the locomotion cycles target:
 * `body`, `head`, `wing-n`/`wing-f`, `tail`, `leg-r`/`leg-l`.
 */

import { parseColor, vec2, type Color } from '@motionforge/core';

import {
  DEFAULT_POTATO_PALETTE,
  type CharacterTemplate,
  type PotatoOptions,
  type PotatoPalette,
} from './potato.js';
import type { RigPose, Skeleton } from './rig.js';
import type { SkinPart } from './skin.js';

export interface CreatureSpec {
  /** Body ellipse: half-sizes + center height, size units. */
  readonly body: { readonly rx: number; readonly ry: number; readonly y: number };
  /** Optional head with a beak (length 0 = none). */
  readonly head?: {
    readonly r: number;
    readonly at: readonly [number, number];
    readonly beak: number;
  };
  /** Flappable wings (near + far), hinged at the body's top. */
  readonly wings?: { readonly length: number; readonly width: number };
  /** A swimming tail fin (bone `tail`). */
  readonly tailFin?: { readonly length: number; readonly height: number };
  readonly dorsalFin?: boolean;
  /** Stick legs down to y = 0 (omit for floaters like fish). */
  readonly legs?: { readonly length: number; readonly gap: number };
}

const BIRD_DEFAULTS: PotatoPalette = {
  skin: parseColor('#e8a13c'), // beak + legs
  outfit: parseColor('#4f7ab5'), // plumage
  outfitDark: parseColor('#38598a'),
  outline: DEFAULT_POTATO_PALETTE.outline,
  boots: parseColor('#e8a13c'),
};

const FISH_DEFAULTS: PotatoPalette = {
  skin: parseColor('#f0e3c0'), // belly
  outfit: parseColor('#4f9a8a'), // scales
  outfitDark: parseColor('#37746a'),
  outline: DEFAULT_POTATO_PALETTE.outline,
  boots: parseColor('#37746a'),
};

const shade = (c: Color, factor = 0.82): Color => ({
  r: Math.round(c.r * factor),
  g: Math.round(c.g * factor),
  b: Math.round(c.b * factor),
  a: c.a,
});

const lighten = (c: Color): Color => ({
  r: Math.round(c.r + (255 - c.r) * 0.28),
  g: Math.round(c.g + (255 - c.g) * 0.28),
  b: Math.round(c.b + (255 - c.b) * 0.28),
  a: c.a,
});

const resolvePalette = (
  defaults: PotatoPalette,
  over: Partial<PotatoPalette> = {},
): PotatoPalette => ({
  skin: over.skin ?? defaults.skin,
  outfit: over.outfit ?? defaults.outfit,
  outfitDark: over.outfitDark ?? (over.outfit ? shade(over.outfit, 0.76) : defaults.outfitDark),
  outline: over.outline ?? defaults.outline,
  boots: over.boots ?? defaults.boots,
});

/** Gentle hover/drift idle: wing settle, tail sway, body breathe. */
export function creatureIdle(tick: number, seedOffset = 0): RigPose {
  const t = (tick + seedOffset) / 120;
  return {
    body: Math.sin(t * 2 * Math.PI * 0.35) * 0.015,
    'wing-n': Math.sin(t * 2 * Math.PI * 0.5) * 0.06,
    'wing-f': Math.sin(t * 2 * Math.PI * 0.5 + 0.4) * 0.06,
    tail: Math.sin(t * 2 * Math.PI * 0.45 + 1.1) * 0.12,
  };
}

/** Build a creature template from a spec (the creature-builder). */
export function creatureTemplate(
  spec: CreatureSpec,
  defaults: PotatoPalette,
  options: PotatoOptions = {},
): CharacterTemplate {
  const s = options.size ?? 1;
  const palette = resolvePalette(defaults, options.palette);
  const bodyY = spec.body.y * s;

  const bones: Array<Skeleton['bones'][number]> = [
    { id: 'body', offset: vec2(-spec.body.rx * s, bodyY), rest: 0, length: 2 * spec.body.rx * s },
  ];
  if (spec.head) {
    bones.push({
      id: 'head',
      parent: 'body',
      offset: vec2((spec.body.rx + spec.head.at[0]) * s, spec.head.at[1] * s),
      rest: 0,
      length: spec.head.r * s,
    });
  }
  if (spec.wings) {
    for (const side of ['n', 'f'] as const) {
      bones.push({
        id: `wing-${side}`,
        parent: 'body',
        offset: vec2(spec.body.rx * s, spec.body.ry * 0.55 * s),
        rest: 2.6,
        length: spec.wings.length * s,
      });
    }
  }
  if (spec.tailFin) {
    bones.push({
      id: 'tail',
      parent: 'body',
      offset: vec2(0.02 * s, 0),
      rest: Math.PI,
      length: spec.tailFin.length * s,
    });
  }
  if (spec.legs) {
    for (const side of ['r', 'l'] as const) {
      bones.push({
        id: `leg-${side}`,
        parent: 'body',
        offset: vec2(
          spec.body.rx * s + (side === 'r' ? 1 : -1) * spec.legs.gap * s,
          -spec.body.ry * 0.7 * s,
        ),
        rest: -Math.PI / 2,
        length: spec.legs.length * s,
      });
    }
  }

  const parts: SkinPart[] = [];
  // Far wing behind everything.
  if (spec.wings) {
    parts.push({
      id: 'wing-f-skin',
      bone: 'wing-f',
      at: vec2((spec.wings.length / 2) * s, 0),
      z: 1,
      shape: {
        kind: 'ellipse',
        rx: (spec.wings.length / 2 + 0.04) * s,
        ry: spec.wings.width * s,
      },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.025 * s },
    });
  }
  if (spec.tailFin) {
    parts.push({
      id: 'tail-skin',
      bone: 'tail',
      at: vec2((spec.tailFin.length / 2) * s, 0),
      z: 1,
      shape: {
        kind: 'polygon',
        points: [
          vec2(-spec.tailFin.length * 0.5 * s, 0),
          vec2(spec.tailFin.length * 0.5 * s, spec.tailFin.height * 0.5 * s),
          vec2(spec.tailFin.length * 0.5 * s, -spec.tailFin.height * 0.5 * s),
        ],
      },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.025 * s },
    });
  }
  if (spec.legs) {
    for (const side of ['r', 'l'] as const) {
      parts.push({
        id: `leg-${side}-skin`,
        bone: `leg-${side}`,
        at: vec2((spec.legs.length / 2) * s, 0),
        z: 2,
        shape: {
          kind: 'rect',
          width: spec.legs.length * s + 0.04 * s,
          height: 0.05 * s,
          rx: 0.025 * s,
        },
        fill: { color: palette.boots },
        stroke: { color: palette.outline, width: 0.015 * s },
      });
    }
  }
  // Body cel stack.
  parts.push(
    {
      id: 'body-base',
      bone: 'body',
      at: vec2(spec.body.rx * s, 0),
      z: 5,
      shape: { kind: 'ellipse', rx: spec.body.rx * s, ry: spec.body.ry * s },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.035 * s },
    },
    {
      id: 'body-fill',
      bone: 'body',
      at: vec2(spec.body.rx * s + 0.02 * s, 0.015 * s),
      z: 6,
      shape: { kind: 'ellipse', rx: spec.body.rx * 0.95 * s, ry: spec.body.ry * 0.94 * s },
      fill: { color: palette.outfit },
    },
    {
      id: 'body-belly',
      bone: 'body',
      at: vec2(spec.body.rx * s + 0.05 * s, -spec.body.ry * 0.4 * s),
      z: 7,
      shape: { kind: 'ellipse', rx: spec.body.rx * 0.6 * s, ry: spec.body.ry * 0.42 * s },
      fill: { color: spec.tailFin ? palette.skin : lighten(palette.outfit) },
    },
  );
  if (spec.dorsalFin) {
    parts.push({
      id: 'dorsal',
      bone: 'body',
      at: vec2(spec.body.rx * s, spec.body.ry * 0.95 * s),
      z: 4,
      shape: {
        kind: 'polygon',
        points: [vec2(-0.16 * s, 0), vec2(0.02 * s, 0.22 * s), vec2(0.16 * s, 0)],
      },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.025 * s },
    });
  }
  if (spec.head) {
    const hx = 0;
    parts.push(
      {
        id: 'head-base',
        bone: 'head',
        at: vec2(hx, 0),
        z: 8,
        shape: { kind: 'circle', r: spec.head.r * s },
        fill: { color: palette.outfitDark },
        stroke: { color: palette.outline, width: 0.03 * s },
      },
      {
        id: 'head-fill',
        bone: 'head',
        at: vec2(hx + 0.015 * s, 0.015 * s),
        z: 9,
        shape: { kind: 'circle', r: spec.head.r * 0.93 * s },
        fill: { color: palette.outfit },
      },
    );
    if (spec.head.beak > 0) {
      parts.push({
        id: 'beak',
        bone: 'head',
        at: vec2(hx + spec.head.r * 0.9 * s, -0.02 * s),
        z: 10,
        shape: {
          kind: 'polygon',
          points: [
            vec2(0, spec.head.r * 0.35 * s),
            vec2(spec.head.beak * s, -0.01 * s),
            vec2(0, -spec.head.r * 0.35 * s),
          ],
        },
        fill: { color: palette.skin },
        stroke: { color: palette.outline, width: 0.02 * s },
      });
    }
  }
  // Eye: a dot on the head (or on the body for headless fish).
  parts.push({
    id: 'eye',
    bone: spec.head ? 'head' : 'body',
    at: spec.head
      ? vec2(spec.head.r * 0.3 * s, spec.head.r * 0.25 * s)
      : vec2(spec.body.rx * 1.72 * s, spec.body.ry * 0.25 * s),
    z: 11,
    shape: { kind: 'circle', r: (spec.head ? spec.head.r * 0.18 : 0.05) * s },
    fill: { color: palette.outline },
  });
  // Near wing above the body.
  if (spec.wings) {
    parts.push({
      id: 'wing-n-skin',
      bone: 'wing-n',
      at: vec2((spec.wings.length / 2) * s, 0),
      z: 12,
      shape: {
        kind: 'ellipse',
        rx: (spec.wings.length / 2 + 0.04) * s,
        ry: spec.wings.width * s,
      },
      fill: { color: palette.outfit },
      stroke: { color: palette.outline, width: 0.025 * s },
    });
  }

  return {
    skeleton: { bones },
    parts,
    headBone: spec.head ? 'head' : 'body',
    handBone: 'body',
    headRadius: (spec.head?.r ?? spec.body.ry) * s,
    size: s,
    palette,
    hasFace: false,
    idle: creatureIdle,
  };
}

/** A plump songbird: wings, beak, stick legs. ~0.95 units tall at size 1. */
export const birdTemplate = (options: PotatoOptions = {}): CharacterTemplate =>
  creatureTemplate(
    {
      body: { rx: 0.32, ry: 0.24, y: 0.5 },
      head: { r: 0.19, at: [0.02, 0.16], beak: 0.16 },
      wings: { length: 0.34, width: 0.11 },
      tailFin: { length: 0.24, height: 0.2 },
      legs: { length: 0.26, gap: 0.08 },
    },
    BIRD_DEFAULTS,
    options,
  );

/** A cheerful river fish: tail fin, dorsal fin, floats at its body line. */
export const fishTemplate = (options: PotatoOptions = {}): CharacterTemplate =>
  creatureTemplate(
    {
      body: { rx: 0.42, ry: 0.2, y: 0.45 },
      tailFin: { length: 0.3, height: 0.34 },
      dorsalFin: true,
    },
    FISH_DEFAULTS,
    options,
  );

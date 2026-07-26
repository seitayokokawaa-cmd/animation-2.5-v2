/**
 * Stage presets (M8.1, plan §5.5): one `stage:` line dresses a skit —
 * backdrop gradient, ground strip, and a few silhouette decor pieces, all
 * built from inline ObjectSpecs so the compiler stays self-contained.
 * Placed props and cast layer on top as usual.
 *
 * Decor sits at depth 0.7–0.85 (background parallax band), ground at 0.9,
 * decor layers −2000 … −1000 so authored content (layer ≥ 0) wins.
 */

import { parseColor, vec2, type Color, type ObjectSpec, type PartSpec } from '@motionforge/core';

export const STAGE_PRESET_NAMES = [
  'palace-hall',
  'throne-room',
  'battlefield',
  'street',
  'meadow',
] as const;

export type StagePresetName = (typeof STAGE_PRESET_NAMES)[number];

export interface StageDecor {
  readonly id: string;
  readonly spec: ObjectSpec;
  readonly at: readonly [number, number];
  readonly depth: number;
}

export interface StagePreset {
  readonly backdrop: { readonly top: string; readonly bottom: string };
  /** Ground strip color; the strip spans the stage at y ≤ groundY. */
  readonly ground: string;
  readonly groundY: number;
  readonly decor: readonly StageDecor[];
}

const c = (hex: string): { color: Color } => ({ color: parseColor(hex) });

const spec = (parts: PartSpec[]): ObjectSpec => ({ params: {}, parts });

const rect = (
  id: string,
  z: number,
  w: number,
  h: number,
  at: [number, number],
  fill: string,
  rx?: number,
): PartSpec => ({
  id,
  z,
  at: vec2(...at),
  shape: { kind: 'rect', width: w, height: h, rx },
  fill: c(fill),
});

const poly = (id: string, z: number, points: [number, number][], fill: string): PartSpec => ({
  id,
  z,
  shape: { kind: 'polygon', points: points.map(([x, y]) => vec2(x, y)) },
  fill: c(fill),
});

// ---- decor pieces ------------------------------------------------------------

const column = spec([
  rect('shaft', 2, 0.55, 4.6, [0, 2.3], '#d9cdb4'),
  rect('shade', 3, 0.16, 4.6, [-0.16, 2.3], '#c4b696'),
  rect('base', 4, 0.9, 0.35, [0, 0.18], '#c4b696'),
  rect('cap', 4, 0.9, 0.3, [0, 4.6], '#c4b696'),
]);

const archWindow = spec([
  rect('frame', 1, 1.5, 2.6, [0, 1.3], '#b7a888', 0.75),
  rect('glass', 2, 1.2, 2.3, [0, 1.28], '#e8ddc2', 0.6),
  rect('mullion', 3, 0.08, 2.3, [0, 1.28], '#b7a888'),
]);

const daisSteps = spec([
  rect('step-1', 1, 7.2, 0.5, [0, 0.25], '#8a3b34'),
  rect('step-2', 2, 5.6, 0.5, [0, 0.75], '#9c453c'),
  rect('step-3', 3, 4.2, 0.5, [0, 1.25], '#a9524a'),
]);

const banner = spec([
  poly(
    'cloth',
    2,
    [
      [-0.55, 4.2],
      [0.55, 4.2],
      [0.55, 1.4],
      [0, 0.8],
      [-0.55, 1.4],
    ],
    '#8a1c1c',
  ),
  rect('trim', 3, 1.1, 0.18, [0, 4.1], '#d4a933'),
  rect('emblem', 3, 0.34, 0.34, [0, 2.8], '#d4a933', 0.17),
]);

const hillFar = spec([
  poly(
    'mound',
    1,
    [
      [-6, 0],
      [-3.4, 2.2],
      [-0.5, 0.6],
      [2.6, 2.6],
      [6, 0],
    ],
    '#b9ad8e',
  ),
]);

const smokePlume = spec([
  { id: 'puff-1', z: 1, at: vec2(0, 0.6), shape: { kind: 'circle', r: 0.45 }, fill: c('#a8a094') },
  {
    id: 'puff-2',
    z: 2,
    at: vec2(0.25, 1.3),
    shape: { kind: 'circle', r: 0.6 },
    fill: c('#b5aea1'),
  },
  {
    id: 'puff-3',
    z: 3,
    at: vec2(0.05, 2.2),
    shape: { kind: 'circle', r: 0.8 },
    fill: c('#c2bcb0'),
  },
]);

const brokenFence = spec([
  rect('rail', 2, 2.4, 0.14, [0, 0.7], '#6b543a'),
  rect('post-a', 1, 0.18, 1.0, [-1, 0.5], '#7a6244'),
  rect('post-b', 1, 0.18, 0.75, [0.1, 0.37], '#7a6244'),
  poly(
    'post-broken',
    1,
    [
      [0.95, 0],
      [1.15, 0],
      [1.3, 0.9],
      [1.05, 0.6],
    ],
    '#7a6244',
  ),
]);

const townhouse = spec([
  rect('wall', 1, 3.2, 4.4, [0, 2.2], '#cbb894'),
  poly(
    'roof',
    2,
    [
      [-1.75, 4.4],
      [0, 5.6],
      [1.75, 4.4],
    ],
    '#8a5a3b',
  ),
  rect('door', 3, 0.8, 1.5, [-0.7, 0.75], '#6b4a2e', 0.08),
  rect('win-a', 3, 0.7, 0.8, [0.6, 2.2], '#efe4c8', 0.06),
  rect('win-b', 3, 0.7, 0.8, [0.6, 3.4], '#efe4c8', 0.06),
  rect('win-c', 3, 0.7, 0.8, [-0.7, 3.4], '#efe4c8', 0.06),
]);

const lampPost = spec([
  rect('pole', 1, 0.14, 3.4, [0, 1.7], '#3f3a30'),
  rect('arm', 2, 0.8, 0.1, [0.3, 3.35], '#3f3a30'),
  {
    id: 'lamp',
    z: 3,
    at: vec2(0.66, 3.15),
    shape: { kind: 'circle', r: 0.26 },
    fill: c('#f2d98c'),
  },
]);

const bush = spec([
  {
    id: 'blob-a',
    z: 1,
    at: vec2(-0.35, 0.35),
    shape: { kind: 'circle', r: 0.5 },
    fill: c('#7d9457'),
  },
  {
    id: 'blob-b',
    z: 2,
    at: vec2(0.3, 0.45),
    shape: { kind: 'circle', r: 0.6 },
    fill: c('#8aa263'),
  },
  { id: 'blob-c', z: 3, at: vec2(0, 0.25), shape: { kind: 'circle', r: 0.45 }, fill: c('#96ad6e') },
]);

// ---- presets -----------------------------------------------------------------

export const STAGE_PRESETS: Readonly<Record<StagePresetName, StagePreset>> = {
  'palace-hall': {
    backdrop: { top: '#e8dcc2', bottom: '#d6c6a2' },
    ground: '#c9ba97',
    groundY: -2.6,
    decor: [
      { id: 'stage-column-l', spec: column, at: [-6.4, -2.6], depth: 0.75 },
      { id: 'stage-column-r', spec: column, at: [6.4, -2.6], depth: 0.75 },
      // Windows flank the stage so center stays clear for the cast.
      { id: 'stage-window-l', spec: archWindow, at: [-3.5, -1.1], depth: 0.82 },
      { id: 'stage-window-r', spec: archWindow, at: [3.5, -1.1], depth: 0.82 },
    ],
  },
  'throne-room': {
    backdrop: { top: '#5e2a26', bottom: '#7a3b34' },
    ground: '#4a221f',
    groundY: -2.6,
    decor: [
      { id: 'stage-dais', spec: daisSteps, at: [0, -2.6], depth: 0.8 },
      { id: 'stage-banner-l', spec: banner, at: [-5.2, -2.2], depth: 0.78 },
      { id: 'stage-banner-r', spec: banner, at: [5.2, -2.2], depth: 0.78 },
    ],
  },
  battlefield: {
    backdrop: { top: '#c6b394', bottom: '#a89272' },
    ground: '#7d6a4f',
    groundY: -2.6,
    decor: [
      { id: 'stage-hills', spec: hillFar, at: [0, -2.6], depth: 0.85 },
      { id: 'stage-smoke-l', spec: smokePlume, at: [-5.5, -2.4], depth: 0.8 },
      { id: 'stage-smoke-r', spec: smokePlume, at: [4.8, -2.5], depth: 0.82 },
      { id: 'stage-fence', spec: brokenFence, at: [5.8, -2.6], depth: 0.72 },
    ],
  },
  street: {
    backdrop: { top: '#cfd8d4', bottom: '#bcc7c1' },
    ground: '#8f8574',
    groundY: -2.6,
    decor: [
      { id: 'stage-house-l', spec: townhouse, at: [-5.6, -2.6], depth: 0.8 },
      { id: 'stage-house-r', spec: townhouse, at: [5.9, -2.6], depth: 0.82 },
      { id: 'stage-lamp', spec: lampPost, at: [-1.8, -2.6], depth: 0.72 },
    ],
  },
  meadow: {
    backdrop: { top: '#cfe0d8', bottom: '#bfd4c6' },
    ground: '#8aa263',
    groundY: -2.6,
    decor: [
      { id: 'stage-hills', spec: hillFar, at: [0, -2.6], depth: 0.85 },
      { id: 'stage-bush-l', spec: bush, at: [-5.4, -2.6], depth: 0.75 },
      { id: 'stage-bush-r', spec: bush, at: [5, -2.6], depth: 0.78 },
    ],
  },
};

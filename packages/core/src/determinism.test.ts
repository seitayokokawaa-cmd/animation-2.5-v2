/**
 * M1 exit criterion: the same scene rendered twice produces identical SVG
 * bytes, locked by a committed golden; the rasterized frame's perceptual
 * hash is stable.
 */
import { join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';

import { parseColor } from './color.js';
import { hammingDistance, matchGolden, phash } from './goldens.js';
import { lerp, lerpVec2, translation, trs, vec2, type Vec2 } from './math.js';
import { RngStreams } from './rng.js';
import { flattenScene, painterSort, type SceneNode } from './scene.js';
import { emitSvg } from './svg.js';
import { createTimeline, createTrack, sample } from './timeline.js';

const GOLDEN_DIR = join(import.meta.dirname, '__goldens__');

/** A small but representative scene driven by a timeline + seeded rng. */
function buildFrame(tick: number): string {
  const timeline = createTimeline([
    createTrack<Vec2>(
      'cart/pos',
      vec2(40, 140),
      [{ start: 0, duration: 240, from: vec2(40, 140), to: vec2(280, 140), easing: 'cubicInOut' }],
      lerpVec2,
    ),
    createTrack<number>('sun/spin', 0, [{ start: 0, duration: 240, from: 0, to: Math.PI }], lerp),
  ]);

  const rng = new RngStreams(7);
  const jitter = rng.get('hills');
  const pos = sample<Vec2>(timeline, 'cart/pos', tick);
  const spin = sample<number>(timeline, 'sun/spin', tick);

  const scene: SceneNode = {
    id: 'root',
    children: [
      {
        id: 'sky',
        depth: 1,
        transform: translation(160, 90), // rects are center-anchored
        shape: { kind: 'rect', width: 320, height: 180 },
        fill: {
          gradient: {
            from: vec2(0, 0),
            to: vec2(0, 180),
            stops: [
              { offset: 0, color: parseColor('#2b3a55') },
              { offset: 1, color: parseColor('#6e8aa8') },
            ],
          },
        },
      },
      {
        id: 'sun',
        depth: 0.9,
        transform: trs(vec2(260, 40), spin, vec2(1, 1)),
        shape: { kind: 'rect', width: 24, height: 24 },
        fill: { color: parseColor('#ffd9a0') },
      },
      ...Array.from({ length: 4 }, (_, i): SceneNode => {
        const wobble = jitter.nextRange(-6, 6);
        return {
          id: `hill-${i}`,
          depth: 0.7,
          transform: translation(i * 90 - 20, 150 + wobble),
          shape: { kind: 'ellipse', rx: 70, ry: 26 },
          fill: { color: parseColor('#7a9e6e') },
        };
      }),
      {
        id: 'cart',
        depth: 0.3,
        transform: translation(pos.x, pos.y),
        shape: { kind: 'rect', width: 46, height: 20, rx: 4 },
        fill: { color: parseColor('#d94f30') },
        stroke: { color: parseColor('#4a3320'), width: 2 },
      },
    ],
  };

  return emitSvg(painterSort(flattenScene(scene)), { width: 320, height: 180 });
}

describe('determinism harness', () => {
  it('same scene twice → identical SVG bytes at every sampled tick', () => {
    for (const tick of [0, 60, 120, 239, 240]) {
      expect(buildFrame(tick)).toBe(buildFrame(tick));
    }
  });

  it('mid-film frame matches the committed golden SVG', () => {
    const result = matchGolden(join(GOLDEN_DIR, 'kernel-frame-t120.svg'), buildFrame(120));
    expect(result.ok, result.message).toBe(true);
  });

  it('rasterized frame has a stable perceptual hash', () => {
    const render = () => {
      const img = new Resvg(buildFrame(120), { font: { loadSystemFonts: false } }).render();
      return phash(new Uint8Array(img.pixels), img.width, img.height);
    };
    const h1 = render();
    expect(hammingDistance(h1, render())).toBe(0);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('phash behavior', () => {
  it('validates buffer size', () => {
    expect(() => phash(new Uint8Array(3), 16, 16)).toThrow(/length/);
  });

  it('small motion is near, different content is far (rendered frames)', () => {
    // pHash operates on rendered frames, so the property is asserted on
    // renders: nudging the cart 6 px barely moves the hash; a frame with the
    // cart elsewhere, or a checkerboard, lands far away.
    const cartAt = (x: number) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#6e8aa8"/><ellipse cx="100" cy="150" rx="70" ry="26" fill="#7a9e6e"/><rect x="${x}" y="130" width="46" height="20" fill="#d94f30"/></svg>`;
    const checker =
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">` +
      Array.from({ length: 8 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) =>
          (i + j) % 2
            ? `<rect x="${i * 40}" y="${j * 40}" width="40" height="40" fill="#000000"/>`
            : '',
        ).join(''),
      ).join('') +
      `</svg>`;
    const hashOf = (svg: string) => {
      const img = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
      return phash(new Uint8Array(img.pixels), img.width, img.height);
    };
    const base = hashOf(cartAt(140));
    expect(hammingDistance(base, hashOf(cartAt(146)))).toBeLessThanOrEqual(8);
    expect(hammingDistance(base, hashOf(cartAt(0)))).toBeGreaterThan(12);
    expect(hammingDistance(base, hashOf(checker))).toBeGreaterThan(12);
  });
});

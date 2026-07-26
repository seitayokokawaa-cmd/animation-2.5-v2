import { describe, expect, it } from 'vitest';

import { parseColor } from './color.js';
import { translation } from './math.js';
import { depthBand, flattenScene, painterSort, type SceneNode } from './scene.js';

const rect = (
  id: string,
  extra: Partial<SceneNode> = {},
): SceneNode & { shape: NonNullable<SceneNode['shape']> } => ({
  id,
  shape: { kind: 'rect', width: 10, height: 10 },
  fill: { color: parseColor('#ff0000') },
  ...extra,
});

describe('flattenScene', () => {
  it('composes transforms down the tree', () => {
    const scene: SceneNode = {
      id: 'root',
      transform: translation(100, 0),
      children: [rect('a', { transform: translation(0, 50) })],
    };
    const [a] = flattenScene(scene);
    expect(a!.anchor).toEqual({ x: 100, y: 50 });
  });

  it('inherits depth, layer and multiplies opacity', () => {
    const scene: SceneNode = {
      id: 'root',
      depth: 0.8,
      layer: 2,
      opacity: 0.5,
      children: [rect('a', { opacity: 0.5 }), rect('b', { depth: 0.1, layer: 5 })],
    };
    const [a, b] = flattenScene(scene);
    expect(a!.depth).toBe(0.8);
    expect(a!.layer).toBe(2);
    expect(a!.opacity).toBe(0.25);
    expect(b!.depth).toBe(0.1);
    expect(b!.layer).toBe(5);
  });

  it('rejects duplicate ids and out-of-range depth', () => {
    expect(() => flattenScene({ id: 'r', children: [rect('x'), rect('x')] })).toThrow(
      /Duplicate node id/,
    );
    expect(() => flattenScene({ id: 'r', children: [rect('x', { depth: 2 })] })).toThrow(
      /depth 2 outside/,
    );
  });

  it('only emits items for nodes with shapes', () => {
    const items = flattenScene({ id: 'r', children: [{ id: 'g', children: [rect('a')] }] });
    expect(items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('painterSort', () => {
  it('draws farther depth bands first', () => {
    const items = flattenScene({
      id: 'r',
      children: [
        rect('near', { depth: 0.1 }),
        rect('far', { depth: 0.9 }),
        rect('mid', { depth: 0.5 }),
      ],
    });
    expect(painterSort(items).map((i) => i.id)).toEqual(['far', 'mid', 'near']);
  });

  it('within a band, sorts by layer then screen-y then stable order', () => {
    const items = flattenScene({
      id: 'r',
      depth: 0.5,
      children: [
        rect('top-layer', { layer: 1 }),
        rect('low-y', { transform: translation(0, 10) }),
        rect('high-y', { transform: translation(0, 90) }),
        rect('tie', { transform: translation(5, 90) }),
      ],
    });
    expect(painterSort(items).map((i) => i.id)).toEqual(['low-y', 'high-y', 'tie', 'top-layer']);
  });

  it('quantizes depth so float noise cannot flip order', () => {
    expect(depthBand(0.5)).toBe(depthBand(0.5 + 1e-9));
    const items = flattenScene({
      id: 'r',
      children: [rect('a', { depth: 0.5 }), rect('b', { depth: 0.5 + 1e-9 })],
    });
    // Same band → stable input order preserved.
    expect(painterSort(items).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const items = flattenScene({
      id: 'r',
      children: [rect('near', { depth: 0.1 }), rect('far', { depth: 0.9 })],
    });
    const before = items.map((i) => i.id);
    painterSort(items);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

import { instantiateObject, type SceneNode } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { compile, toObjectSpec } from './compile.js';
import { objectDefSchema } from './parts.js';
import { mfsSchema } from './schema.js';

const cartDef = objectDefSchema.parse({
  params: { body: '#804020' },
  parts: [
    { id: 'body', at: [0, 0.8], shape: { kind: 'rect', width: 2, height: 0.5 }, fill: '$body' },
    {
      id: 'wheel',
      at: [-0.7, 0.3],
      pivot: [0, 0],
      shape: { kind: 'circle', r: 0.3 },
      fill: '#404040',
      parts: [{ id: 'spoke', shape: { kind: 'rect', width: 0.5, height: 0.06 }, fill: '#202020' }],
    },
  ],
});

const flat = (n: SceneNode, out: SceneNode[] = []): SceneNode[] => {
  out.push(n);
  n.children?.forEach((c) => flat(c, out));
  return out;
};

describe('object instancing (M5.2)', () => {
  const spec = toObjectSpec(cartDef);

  it('resolves color params with overrides', () => {
    const node = instantiateObject(spec, { idPrefix: 'c', params: {} });
    const body = flat(node).find((n) => n.id === 'c/body')!;
    expect(body.fill!.color).toEqual({ r: 128, g: 64, b: 32, a: 1 });
    const blue = instantiateObject(spec, {
      idPrefix: 'c',
      params: { body: { r: 0, g: 0, b: 255, a: 1 } },
    });
    expect(flat(blue).find((n) => n.id === 'c/body')!.fill!.color!.b).toBe(255);
  });

  it('applies multiply tint to fills and strokes', () => {
    const tinted = instantiateObject(spec, {
      idPrefix: 'c',
      tint: { r: 128, g: 255, b: 255, a: 1 },
    });
    expect(flat(tinted).find((n) => n.id === 'c/body')!.fill!.color!.r).toBe(64);
  });

  it('flip mirrors horizontally; scale scales uniformly', () => {
    const node = instantiateObject(spec, { idPrefix: 'c', flip: true, scale: 2 });
    expect(node.transform!.a).toBe(-2);
    expect(node.transform!.d).toBe(2);
  });

  it('assigns increasing layers in tree order for stable stacking', () => {
    const node = instantiateObject(spec, { idPrefix: 'c', layerBase: 5000 });
    const layers = flat(node)
      .filter((n) => n.shape)
      .map((n) => n.layer!);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
    expect(layers[0]).toBeGreaterThanOrEqual(5000);
  });

  it('throws on unknown param references', () => {
    const bad = toObjectSpec(
      objectDefSchema.parse({
        parts: [{ id: 'a', shape: { kind: 'circle', r: 1 }, fill: '$missing' }],
      }),
    );
    expect(() => instantiateObject(bad, { idPrefix: 'x' })).toThrow(/unknown color param/);
  });

  it('compiles object placements into part-tree instances', () => {
    const film = compile(
      mfsSchema.parse({
        motionforge: 2,
        meta: { title: 'T', resolution: '640x360', fps: 30 },
        objects: {
          cart: {
            params: { body: '#804020' },
            parts: [{ id: 'body', shape: { kind: 'rect', width: 2, height: 0.5 }, fill: '$body' }],
          },
        },
        scenes: [
          {
            id: 's',
            duration: 2,
            place: [{ ref: 'cart', as: 'c1', at: [1, 0], flip: true, with: { body: '#0000ff' } }],
          },
        ],
      }),
    );
    const inst = film.scenes[0]!.instances[0]!;
    expect(inst.shape).toBeUndefined();
    expect(inst.parts).toBeDefined();
    expect(flat(inst.parts!).find((n) => n.id === 'c1/body')!.fill!.color!.b).toBe(255);
  });
});

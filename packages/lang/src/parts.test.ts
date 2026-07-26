import { describe, expect, it } from 'vitest';

import { objectDefSchema, partIds, referencedParams } from './parts.js';
import { mfsSchema } from './schema.js';

const cart = {
  params: { body: '#8a6a3f' },
  parts: [
    {
      id: 'body',
      at: [0, 0.8],
      shape: { kind: 'rect', width: 2.2, height: 0.5 },
      fill: '$body',
      parts: [{ id: 'trim', shape: { kind: 'rect', width: 2.2, height: 0.1 }, fill: '#4a3320' }],
    },
    {
      id: 'wheel',
      at: [-0.7, 0.35],
      pivot: [0, 0],
      shape: { kind: 'circle', r: 0.35 },
      fill: '#4a3320',
      stroke: { color: '#2e2216', width: 0.05 },
    },
    {
      id: 'sky-panel',
      shape: { kind: 'rect', width: 1, height: 1 },
      fill: {
        from: [0, 0.5],
        to: [0, -0.5],
        stops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: '#88aacc' },
        ],
      },
    },
  ],
};

describe('object part-tree schema (M5.1)', () => {
  it('accepts nested parts, param refs, pivots, gradients', () => {
    const def = objectDefSchema.parse(cart);
    expect(partIds(def)).toEqual(['body', 'trim', 'wheel', 'sky-panel']);
    expect(referencedParams(def)).toEqual(['body']);
  });

  it('rejects bad param refs, empty parts, unknown keys', () => {
    expect(objectDefSchema.safeParse({ parts: [] }).success).toBe(false);
    expect(
      objectDefSchema.safeParse({
        parts: [{ id: 'a', fill: 'body', shape: { kind: 'circle', r: 1 } }],
      }).success,
    ).toBe(false);
    expect(
      objectDefSchema.safeParse({
        parts: [{ id: 'a', wobble: 1 }],
      }).success,
    ).toBe(false);
  });

  it('rides along in the film schema with use: and placement options', () => {
    const doc = mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'T', resolution: '640x360', fps: 30 },
      objects: { cart },
      use: ['library/props.yaml'],
      scenes: [
        {
          id: 's',
          duration: 2,
          place: [
            {
              ref: 'cart',
              as: 'c1',
              at: [0, 0],
              flip: true,
              tint: '#ffcc99',
              with: { body: '#3c6fb5' },
            },
          ],
        },
      ],
    });
    expect(Object.keys(doc.objects)).toEqual(['cart']);
    expect(doc.use).toEqual(['library/props.yaml']);
    expect(doc.scenes[0]!.place[0]).toMatchObject({ flip: true, tint: '#ffcc99' });
  });
});

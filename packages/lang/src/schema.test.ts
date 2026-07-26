import { describe, expect, it } from 'vitest';

import { mfsSchema } from './schema.js';

const valid = {
  motionforge: 1,
  meta: { title: 'Shapes', resolution: '1920x1080', fps: 30, seed: 7 },
  shapes: {
    box: { kind: 'rect', width: 2, height: 1, fill: '#d94f30' },
    ball: { kind: 'circle', r: 0.5, fill: '#3c6fb5', stroke: { color: '#ffffff', width: 0.05 } },
  },
  scenes: [
    {
      id: 'intro',
      duration: 4,
      place: [{ ref: 'box', as: 'box-1', at: [0, 0], depth: 0.5 }],
      actions: [
        { at: 0.5, move: { target: 'box-1', to: [4, 0], duration: 2, easing: 'cubicInOut' } },
        { at: 1, caption: { text: 'hello', duration: 2, size: 0.6 } },
        { at: 2, camera: { zoom: 1.3, duration: 1 } },
      ],
    },
  ],
};

describe('mfsSchema', () => {
  it('accepts a representative document and applies defaults', () => {
    const parsed = mfsSchema.parse(valid);
    expect(parsed.meta.seed).toBe(7);
    expect(parsed.scenes[0]!.place[0]!.as).toBe('box-1');
    expect(mfsSchema.parse({ ...valid, shapes: undefined }).shapes).toEqual({});
  });

  it('rejects unknown fps', () => {
    const doc = { ...valid, meta: { ...valid.meta, fps: 25 } };
    const res = mfsSchema.safeParse(doc);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toMatch(/fps must divide/);
  });

  it('rejects bad colors, names, and resolutions', () => {
    expect(
      mfsSchema.safeParse({
        ...valid,
        shapes: { box: { kind: 'rect', width: 1, height: 1, fill: 'red' } },
      }).success,
    ).toBe(false);
    expect(
      mfsSchema.safeParse({
        ...valid,
        scenes: [{ ...valid.scenes[0], id: 'Bad_Id' }],
      }).success,
    ).toBe(false);
    expect(
      mfsSchema.safeParse({ ...valid, meta: { ...valid.meta, resolution: '1080p' } }).success,
    ).toBe(false);
  });

  it('requires exactly one verb per action', () => {
    const two = {
      at: 0,
      move: { target: 'box-1', to: [1, 1], duration: 1 },
      rotate: { target: 'box-1', to: 90, duration: 1 },
    };
    const none = { at: 0 };
    for (const action of [two, none]) {
      const res = mfsSchema.safeParse({
        ...valid,
        scenes: [{ ...valid.scenes[0], actions: [action] }],
      });
      expect(res.success).toBe(false);
      expect(JSON.stringify(res.error?.issues)).toMatch(/Exactly one verb/);
    }
  });

  it('rejects unknown keys (strict everywhere)', () => {
    const res = mfsSchema.safeParse({ ...valid, extra: true });
    expect(res.success).toBe(false);
    const res2 = mfsSchema.safeParse({
      ...valid,
      scenes: [{ ...valid.scenes[0], plaec: [] }],
    });
    expect(res2.success).toBe(false);
  });

  it('rejects polygons with fewer than 3 points', () => {
    const res = mfsSchema.safeParse({
      ...valid,
      shapes: {
        tri: {
          kind: 'polygon',
          points: [
            [0, 0],
            [1, 1],
          ],
        },
      },
    });
    expect(res.success).toBe(false);
  });
});

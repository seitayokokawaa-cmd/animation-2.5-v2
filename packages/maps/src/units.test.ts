import { vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { battleNodes, flagNodes, marchNodes, UNIT_KINDS, unitNodes } from './units.js';

const RED = { r: 0xb5, g: 0x45, b: 0x3c, a: 1 };

describe('units and battles (M7.5)', () => {
  it('ships all four unit kinds as multi-shape silhouettes', () => {
    for (const kind of UNIT_KINDS) {
      const nodes = unitNodes(kind, { color: RED, idPrefix: 'u' });
      expect(nodes.length, kind).toBeGreaterThanOrEqual(4);
      const ids = nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('marches in formation: leader arrives, column trails, all arrive held', () => {
    const opts = {
      kind: 'infantry' as const,
      count: 4,
      color: RED,
      bow: 0,
      idPrefix: 'm',
      seed: 's',
      filmSeed: 7,
    };
    const early = marchNodes(vec2(0, 0), vec2(4, 0), 0.1, opts);
    const mid = marchNodes(vec2(0, 0), vec2(4, 0), 0.6, opts);
    const done = marchNodes(vec2(0, 0), vec2(4, 0), 1, opts);
    const units = (nodes: typeof mid) => nodes.filter((n) => /\/u\d+$/.test(n.id));
    expect(units(early).length).toBeLessThan(4); // rear ranks not launched yet
    expect(units(mid).length).toBe(4);
    // Held formation at the end: leader on target, followers spaced behind.
    const xs = units(done).map((n) => n.transform!.e);
    expect(xs[0]).toBeCloseTo(4, 6);
    expect(xs[1]).toBeLessThan(xs[0]!);
    // Dust puffs accompany a moving ground column.
    expect(mid.some((n) => n.id.includes('dust'))).toBe(true);
    expect(marchNodes(vec2(0, 0), vec2(4, 0), 0.6, opts)).toEqual(mid); // pure
  });

  it('planes fly (no dust, lifted), ships sail (no dust)', () => {
    const base = { count: 2, color: RED, bow: 0, idPrefix: 'm', seed: 's', filmSeed: 7 };
    const air = marchNodes(vec2(0, 0), vec2(4, 0), 0.5, { ...base, kind: 'plane' });
    expect(air.some((n) => n.id.includes('dust'))).toBe(false);
    expect(air[0]!.transform!.f).toBeGreaterThan(0.4); // altitude
    const sea = marchNodes(vec2(0, 0), vec2(4, 0), 0.5, { ...base, kind: 'ship' });
    expect(sea.some((n) => n.id.includes('dust'))).toBe(false);
  });

  it('battle bursts loop stars and smoke deterministically', () => {
    const a = battleNodes(vec2(1, 1), 0.3, 'b', 'seed', 7);
    expect(a.some((n) => n.id.includes('burst'))).toBe(true);
    expect(a.filter((n) => n.id.includes('smoke')).length).toBe(3);
    expect(battleNodes(vec2(1, 1), 0.3, 'b', 'seed', 7)).toEqual(a);
  });

  it('flags pop in and keep waving', () => {
    expect(flagNodes(vec2(0, 0), 0, RED, 'f')).toEqual([]);
    const popped = flagNodes(vec2(0, 0), 0.1, RED, 'f')[0]!;
    expect(popped.transform!.a).toBeGreaterThan(0); // scaling up
    const settled = flagNodes(vec2(2, 1), 1.5, RED, 'f')[0]!;
    expect(settled.transform!.a).toBeCloseTo(1, 6);
    // The pennant flaps between two frames over time.
    const frameA = JSON.stringify(flagNodes(vec2(0, 0), 1.0, RED, 'f'));
    const frameB = JSON.stringify(flagNodes(vec2(0, 0), 1.07, RED, 'f'));
    expect(frameA).not.toBe(frameB);
  });
});

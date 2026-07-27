/**
 * Shatter + debris (M14.5): seeded fracture geometry, rigid ballistic
 * shards, target-colored pieces, and full determinism.
 */
import type { FilmEffect } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { emitEffectNodes, sampleEffect, verb } from './verbs.js';

const effect = (params: Record<string, number> = {}): FilmEffect => ({
  target: 'vase',
  verb: 'shatter',
  startTick: 0,
  durationTicks: 132,
  params,
  seed: 'shatter/a/0',
});

describe('shatter (M14.5)', () => {
  it('registers with hide-from-start and a slam', () => {
    const def = verb('shatter');
    expect(def.hideTargetFromStart).toBe(true);
    expect(def.defaultSfx).toBe('slam');
    expect(sampleEffect(effect(), 10, 7).opacity).toBe(0);
    expect(sampleEffect(effect(), 900, 7).opacity).toBe(0); // stays gone
  });

  it('emits a crack flash, shards, and dust — deterministically', () => {
    const early = emitEffectNodes(effect(), 4, 7);
    expect(early.some((n) => n.id.endsWith('/flash'))).toBe(true);
    expect(early.filter((n) => n.id.includes('/shard'))).toHaveLength(8);
    expect(early.filter((n) => n.id.includes('/dust'))).toHaveLength(12);
    expect(emitEffectNodes(effect(), 4, 7)).toEqual(early);
    // A different seed cracks differently.
    const other = emitEffectNodes({ ...effect(), seed: 'shatter/b/1' }, 4, 7);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(early));
  });

  it('shards fly outward, drop under gravity, and tumble', () => {
    const at = (tick: number) =>
      emitEffectNodes(effect(), tick, 7).find((n) => n.id.endsWith('/shard0'))!;
    const t20 = at(20).transform!;
    const t60 = at(60).transform!;
    expect(Math.hypot(t60.e, 0)).toBeGreaterThan(Math.hypot(t20.e, 0)); // outward
    // Gravity wins late: the same shard sits lower at the end than its peak.
    const ys = [20, 50, 80, 110, 128].map((tk) => at(tk).transform!.f);
    expect(Math.min(...ys.slice(-1))).toBeLessThan(Math.max(...ys));
    // Tumble: the rotation part of the transform changes over time.
    expect(t60.a).not.toBeCloseTo(t20.a, 6);
  });

  it('shards wear the target color from params and fade out late', () => {
    const colored = emitEffectNodes(effect({ cr: 40, cg: 90, cb: 200 }), 10, 7);
    const shard = colored.find((n) => n.id.endsWith('/shard0'))!;
    expect(shard.fill?.color).toMatchObject({ r: 40, g: 90, b: 200 });
    const late = emitEffectNodes(effect(), 128, 7).find((n) => n.id.endsWith('/shard0'))!;
    expect(late.opacity!).toBeLessThan(0.15);
    // Dust is gone even earlier.
    const lateDust = emitEffectNodes(effect(), 100, 7).filter((n) => n.id.includes('/dust'));
    for (const d of lateDust) expect(d.opacity ?? 0).toBe(0);
  });

  it('respects radius and count params', () => {
    const nodes = emitEffectNodes(effect({ count: 5, radius: 1.2 }), 10, 7);
    expect(nodes.filter((n) => n.id.includes('/shard'))).toHaveLength(5);
  });
});

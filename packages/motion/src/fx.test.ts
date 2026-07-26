import type { FilmEffect } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { emitEffectNodes, sampleEffect, verb } from './verbs.js';

const effect = (name: string, params: Record<string, number> = {}): FilmEffect => ({
  target: 'x',
  verb: name,
  startTick: 0,
  durationTicks: 96,
  params,
  seed: `${name}/t/0`,
});

describe('cartoon fx (M4.3)', () => {
  it('explode hides the target from start and emits flash, puffs, debris', () => {
    const e = effect('explode');
    expect(sampleEffect(e, 10, 7).opacity).toBe(0);
    expect(sampleEffect(e, 500, 7).opacity).toBe(0); // stays gone
    const early = emitEffectNodes(e, 4, 7);
    expect(early.some((n) => n.id.endsWith('/flash'))).toBe(true);
    expect(early.filter((n) => n.id.includes('/puff'))).toHaveLength(8);
    expect(early.filter((n) => n.id.includes('/debris'))).toHaveLength(10);
    // Puffs travel outward over time.
    const puffAt = (tick: number) =>
      emitEffectNodes(e, tick, 7).find((n) => n.id.endsWith('/puff0'))!.transform!.e;
    expect(Math.abs(puffAt(80))).toBeGreaterThan(Math.abs(puffAt(10)));
    // Outside the window: nothing.
    expect(emitEffectNodes(e, 96, 7)).toEqual([]);
  });

  it('impact-stars respects count and fades out', () => {
    const e = effect('impact-stars', { count: 7 });
    const nodes = emitEffectNodes(e, 10, 7);
    expect(nodes).toHaveLength(7);
    const late = emitEffectNodes(e, 90, 7);
    expect(late[0]!.opacity!).toBeLessThan(nodes[0]!.opacity!);
  });

  it('emitters are deterministic per seed and differ across seeds', () => {
    const a = emitEffectNodes(effect('sweat'), 30, 7);
    const b = emitEffectNodes(effect('sweat'), 30, 7);
    expect(a).toEqual(b);
    const other = emitEffectNodes({ ...effect('sweat'), seed: 'sweat/z/9' }, 30, 7);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(a));
  });

  it('steam rises; speedlines trail along the angle', () => {
    const rise0 = emitEffectNodes(effect('steam'), 5, 7)[0]!.transform!.f;
    const rise1 = emitEffectNodes(effect('steam'), 40, 7)[0]!.transform!.f;
    expect(rise1).toBeGreaterThan(rise0);
    const lines = emitEffectNodes(effect('speedlines', { angle: 0 }), 20, 7);
    for (const line of lines) expect(line.transform!.e).toBeGreaterThan(0);
  });

  it('fx verbs carry default SFX for the M9 audio bus', () => {
    expect(verb('explode').defaultSfx).toBe('boom');
    expect(verb('impact-stars').defaultSfx).toBe('boink');
    expect(verb('speedlines').defaultSfx).toBe('whoosh');
  });
});

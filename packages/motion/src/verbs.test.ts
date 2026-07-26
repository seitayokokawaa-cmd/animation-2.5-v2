import { EASING_NAMES, type FilmEffect } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { sampleEffect, verb, VERB_REGISTRY } from './verbs.js';

const effect = (name: string, params: Record<string, number> = {}): FilmEffect => ({
  target: 'x',
  verb: name,
  startTick: 100,
  durationTicks: 48,
  params,
  seed: `${name}/test/0`,
});

const at = (e: FilmEffect, tick: number) => sampleEffect(e, tick, 7);

describe('emphasis verb registry (M4.1)', () => {
  it('registers the genre verbs with docs and defaults', () => {
    for (const name of ['pop-in', 'pop-out', 'spin-in', 'slam', 'wiggle', 'pulse', 'shake']) {
      const def = verb(name);
      expect(def.summary.length).toBeGreaterThan(10);
      expect(def.defaultDurationSeconds).toBeGreaterThan(0);
    }
    expect(() => verb('teleport')).toThrow(/Unknown motion verb/);
    expect(VERB_REGISTRY.size).toBeGreaterThanOrEqual(8);
  });

  it('pop-in: hidden before, grows through overshoot to 1', () => {
    const e = effect('pop-in');
    expect(at(e, 0).opacity).toBe(0);
    expect(at(e, 100).scale!.x).toBeCloseTo(0, 9);
    const mid = at(e, 124).scale!.x;
    expect(mid).toBeGreaterThan(0.5);
    // backOut overshoots above the final scale mid-flight.
    const peak = Math.max(...Array.from({ length: 48 }, (_, i) => at(e, 100 + i).scale!.x));
    expect(peak).toBeGreaterThan(1.01);
    expect(at(e, 999).scale?.x ?? 1).toBe(1); // after: no pose, fully visible
  });

  it('pop-out: hidden after the effect ends', () => {
    const e = effect('pop-out');
    expect(at(e, 99).opacity ?? 1).toBe(1);
    expect(at(e, 147).scale!.x).toBeLessThan(0.1);
    expect(at(e, 148).opacity).toBe(0);
  });

  it('slam: falls from height then squashes wider than tall', () => {
    const e = effect('slam', { height: 5 });
    expect(at(e, 100).translate!.y).toBeCloseTo(5, 6);
    const falling = at(e, 110).translate!.y;
    expect(falling).toBeGreaterThan(0);
    expect(falling).toBeLessThan(5);
    const landing = at(e, 100 + Math.round(48 * 0.8));
    expect(landing.scale!.x).toBeGreaterThan(1);
    expect(landing.scale!.y).toBeLessThan(1);
  });

  it('wiggle and shake are seeded and deterministic', () => {
    const w = effect('wiggle');
    expect(at(w, 120).rotate).toBe(at(w, 120).rotate);
    const a = Array.from({ length: 10 }, (_, i) => at(w, 105 + i * 4).rotate);
    const b = Array.from({ length: 10 }, (_, i) => at(w, 105 + i * 4).rotate);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(2); // actually jitters
    const s1 = sampleEffect(effect('shake'), 120, 7);
    const s2 = sampleEffect({ ...effect('shake'), seed: 'shake/other/1' }, 120, 7);
    expect(s1.translate).not.toEqual(s2.translate);
  });

  it('pulse returns to rest and peaks mid-beat', () => {
    const e = effect('pulse', { to: 1.5 });
    expect(at(e, 100).scale!.x).toBeCloseTo(1, 5);
    expect(at(e, 124).scale!.x).toBeGreaterThan(1.4);
    expect(at(e, 147).scale!.x).toBeCloseTo(1, 1);
  });

  it('bounce-bob lifts between landings and never sinks below ground', () => {
    const e = effect('bounce-bob', { hops: 3, height: 0.5 });
    for (let tick = 100; tick < 148; tick++) {
      expect(at(e, tick).translate!.y).toBeGreaterThanOrEqual(0);
    }
    const peak = Math.max(...Array.from({ length: 48 }, (_, i) => at(e, 100 + i).translate!.y));
    expect(peak).toBeCloseTo(0.5, 1);
  });
});

describe('squash-stretch (M4.4)', () => {
  it('preserves area (sx * sy = 1) and returns to rest', () => {
    const e: FilmEffect = {
      target: 'x',
      verb: 'squash-stretch',
      startTick: 0,
      durationTicks: 60,
      params: { amount: 0.3, beats: 2 },
      seed: 'sq/t/0',
    };
    for (const tick of [5, 15, 30, 45, 55]) {
      const pose = sampleEffect(e, tick, 7);
      expect(pose.scale!.x * pose.scale!.y).toBeCloseTo(1, 9);
    }
    expect(sampleEffect(e, 0, 7).scale!.x).toBeCloseTo(1, 6);
    const mid = sampleEffect(e, 8, 7).scale!.x;
    expect(Math.abs(mid - 1)).toBeGreaterThan(0.05);
  });
});

describe('keyframes escape hatch (M8.6)', () => {
  const LIN = EASING_NAMES.indexOf('linear');
  const effect: FilmEffect = {
    target: 'b',
    verb: 'keyframes',
    startTick: 0,
    durationTicks: 240, // 2 s
    params: {
      property: 2, // rotate
      count: 3,
      t0: 0,
      v0: 0,
      e0: LIN,
      t1: 0.5,
      v1: -Math.PI / 2,
      e1: LIN,
      t2: 1,
      v2: Math.PI / 4,
      e2: LIN,
    },
    seed: 'kf/t/0',
  };

  it('interpolates between frames and holds the final value', () => {
    expect(sampleEffect(effect, 0, 7).rotate).toBeCloseTo(0, 9);
    expect(sampleEffect(effect, 60, 7).rotate).toBeCloseTo(-Math.PI / 4, 6); // halfway to frame 1
    expect(sampleEffect(effect, 120, 7).rotate).toBeCloseTo(-Math.PI / 2, 6);
    expect(sampleEffect(effect, 239, 7).rotate).toBeCloseTo(Math.PI / 4, 1);
    // holdAfter: the last value persists beyond the window.
    expect(sampleEffect(effect, 400, 7).rotate).toBeCloseTo(Math.PI / 4, 9);
  });

  it('maps properties onto the right pose channels', () => {
    const asY = { ...effect, params: { ...effect.params, property: 1 } };
    expect(sampleEffect(asY, 120, 7).translate!.y).toBeCloseTo(-Math.PI / 2, 6);
    const asScale = { ...effect, params: { ...effect.params, property: 3, v1: 2 } };
    expect(sampleEffect(asScale, 120, 7).scale!.x).toBeCloseTo(2, 6);
  });
});

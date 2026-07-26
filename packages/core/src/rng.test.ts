import { describe, expect, it } from 'vitest';

import { fnv1a, Pcg32, RngStreams } from './rng.js';

describe('Pcg32', () => {
  it('matches the PCG32 reference sequence for seed=42, stream=54', () => {
    // First outputs of the canonical pcg32 demo (pcg-random.org).
    const rng = new Pcg32(42, 54);
    const expected = [0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e];
    for (const value of expected) expect(rng.nextUint32()).toBe(value);
  });

  it('is reproducible: same seed/stream → same sequence', () => {
    const a = new Pcg32(7, 99);
    const b = new Pcg32(7, 99);
    for (let i = 0; i < 100; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('decorrelates streams with the same seed', () => {
    const a = new Pcg32(7, 1);
    const b = new Pcg32(7, 2);
    const same = Array.from({ length: 32 }, () => a.nextUint32() === b.nextUint32());
    expect(same.every(Boolean)).toBe(false);
  });

  it('produces floats in [0,1) and ints in range without bias crash', () => {
    const rng = new Pcg32(123);
    for (let i = 0; i < 1000; i++) {
      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.nextInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      const r = rng.nextRange(-2, 2);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(2);
    }
  });

  it('rejects invalid bounds', () => {
    const rng = new Pcg32(1);
    expect(() => rng.nextInt(0)).toThrow(/Invalid bound/);
    expect(() => rng.nextInt(2.5)).toThrow(/Invalid bound/);
  });
});

describe('fnv1a', () => {
  it('matches known vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
});

describe('RngStreams', () => {
  it('returns the same stream object per name and stable sequences per seed', () => {
    const s1 = new RngStreams(7);
    const s2 = new RngStreams(7);
    expect(s1.get('blink/franz')).toBe(s1.get('blink/franz'));
    expect(s1.get('blink/franz').nextUint32()).toBe(s2.get('blink/franz').nextUint32());
  });

  it('gives different sequences for different names and seeds', () => {
    const s = new RngStreams(7);
    expect(s.get('shake/cam').nextUint32()).not.toBe(s.get('blink/franz').nextUint32());
    const other = new RngStreams(8);
    expect(other.get('shake/cam').nextUint32()).not.toBe(
      new RngStreams(7).get('shake/cam').nextUint32(),
    );
  });

  it('rejects non-integer seeds', () => {
    expect(() => new RngStreams(1.5)).toThrow(/integer/);
  });
});

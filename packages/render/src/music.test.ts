import { describe, expect, it } from 'vitest';

import { MUSIC_MOODS, MUSIC_RATE, musicBed, musicLoop, stingerSamples } from './music.js';

describe('procedural music beds (M9.3, ADR-0009)', () => {
  it('every mood loops with an integer-beat grid and audible content', () => {
    for (const mood of MUSIC_MOODS) {
      const loop = musicLoop(mood);
      expect(loop.length % 4, mood).toBe(0);
      let peak = 0;
      let finite = true;
      for (let i = 0; i < loop.length; i++) {
        const a = Math.abs(loop[i]!);
        if (!Number.isFinite(a)) finite = false;
        if (a > peak) peak = a;
      }
      expect(finite, mood).toBe(true);
      expect(peak, mood).toBeGreaterThan(0.15);
      expect(peak, mood).toBeLessThan(1.2);
    }
  });

  it('beds tile the loop cleanly to any length with edge fades', () => {
    const n = Math.round(17.3 * MUSIC_RATE);
    const bed = musicBed('jaunty', n);
    expect(bed.length).toBe(n);
    // The loop repeats exactly one loop-length apart (mid-bed, fades aside).
    const loop = musicLoop('jaunty');
    const at = Math.round(0.5 * MUSIC_RATE);
    expect(bed[at + loop.length]).toBeCloseTo(bed[at]!, 6);
    // Fades: edges start/end silent.
    expect(Math.abs(bed[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(bed[n - 1]!)).toBeLessThan(1e-3);
  });

  it('stingers exist and are pure; unknown names are silent', () => {
    expect(stingerSamples('riser').length).toBeGreaterThan(MUSIC_RATE);
    expect(stingerSamples('sting').length).toBeGreaterThan(0);
    expect(stingerSamples('riser')).toEqual(stingerSamples('riser'));
    expect(stingerSamples('kazoo').length).toBe(0);
  });
});

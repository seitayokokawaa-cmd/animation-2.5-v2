import { describe, expect, it } from 'vitest';

import { SFX_NAMES, SFX_RATE, sfxSamples } from './sfx.js';

describe('procedural sfx library (M9.2, ADR-0009)', () => {
  it('ships every cue the verb registry and plan name', () => {
    for (const name of [
      'pop',
      'boink',
      'whoosh',
      'slam',
      'boom',
      'crowd',
      'quill',
      'ding',
      'drumroll',
      'march',
      'thud',
    ]) {
      expect(SFX_NAMES).toContain(name);
    }
  });

  it('synthesizes bounded, audible, finite audio for every cue', () => {
    for (const name of SFX_NAMES) {
      const samples = sfxSamples(name);
      expect(samples.length, name).toBeGreaterThan(SFX_RATE * 0.05);
      expect(samples.length, name).toBeLessThan(SFX_RATE * 2);
      let peak = 0;
      let sum = 0;
      let allFinite = true;
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]!);
        if (!Number.isFinite(a)) allFinite = false;
        if (a > peak) peak = a;
        sum += a;
      }
      expect(allFinite, name).toBe(true);
      expect(peak, name).toBeLessThanOrEqual(1.5);
      expect(peak, name).toBeGreaterThan(0.2);
      expect(sum / samples.length, name).toBeGreaterThan(0.005); // not near-silence
    }
  });

  it('is deterministic per name and silent for unknown cues', () => {
    expect(sfxSamples('boink')).toEqual(sfxSamples('boink'));
    expect(sfxSamples('pop')).not.toEqual(sfxSamples('ding'));
    expect(sfxSamples('kazoo').length).toBe(0);
  });
});

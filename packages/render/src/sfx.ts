/**
 * Procedural SFX library (M9.2, ADR-0009): every cartoon cue the genre
 * uses, synthesized as pure 48 kHz mono DSP — envelopes over sines and
 * seeded-noise, deterministic per cue name. No sample files, no
 * provenance risk; the exaggerated synthetic character is the genre sound.
 */

import { Pcg32, fnv1a } from '@motionforge/core';

export const SFX_RATE = 48000;

export const SFX_NAMES = [
  'pop',
  'boink',
  'whoosh',
  'slam',
  'thud',
  'boom',
  'crowd',
  'quill',
  'ding',
  'drumroll',
  'march',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

const TWO_PI = Math.PI * 2;

/** Seeded white noise for a cue (same name → same noise, always). */
const noiseFor = (name: string, length: number): Float32Array => {
  const rng = new Pcg32(0x5f_00d, BigInt(fnv1a(name)));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rng.nextFloat() * 2 - 1;
  return out;
};

const seconds = (s: number): number => Math.round(s * SFX_RATE);

/** One-pole lowpass, in place. */
const lowpass = (samples: Float32Array, alpha: number): Float32Array => {
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y += alpha * (samples[i]! - y);
    samples[i] = y;
  }
  return samples;
};

/** Exponential decay envelope. */
const decay = (i: number, length: number, sharpness = 5): number =>
  Math.exp((-sharpness * i) / length);

function synth(name: SfxName): Float32Array {
  switch (name) {
    case 'pop': {
      // Quick pitch-up blip with a click of noise at the front.
      const n = seconds(0.09);
      const out = new Float32Array(n);
      const noise = noiseFor('pop', n);
      for (let i = 0; i < n; i++) {
        const t = i / SFX_RATE;
        const f = 380 + 900 * (i / n);
        out[i] =
          (Math.sin(TWO_PI * f * t) * 0.8 + noise[i]! * 0.25 * decay(i, n, 18)) * decay(i, n, 6);
      }
      return out;
    }
    case 'boink': {
      // Springy sine dropping with vibrato.
      const n = seconds(0.28);
      const out = new Float32Array(n);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const f = 640 - 380 * u + Math.sin(TWO_PI * 21 * (i / SFX_RATE)) * 40 * (1 - u);
        phase += (TWO_PI * f) / SFX_RATE;
        out[i] = Math.sin(phase) * 0.75 * decay(i, n, 4);
      }
      return out;
    }
    case 'whoosh': {
      // Band-ish noise swelling then fading.
      const n = seconds(0.34);
      const out = lowpass(noiseFor('whoosh', n), 0.12);
      for (let i = 0; i < n; i++) {
        const u = i / n;
        out[i]! *= Math.sin(Math.PI * u) ** 1.5 * 1.6;
      }
      return out;
    }
    case 'slam':
    case 'thud': {
      // Low sine thump + a slap of noise.
      const long = name === 'slam';
      const n = seconds(long ? 0.3 : 0.22);
      const out = new Float32Array(n);
      const noise = lowpass(noiseFor(name, n), 0.25);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const f = (long ? 95 : 130) * (1 - 0.4 * u);
        phase += (TWO_PI * f) / SFX_RATE;
        out[i] = Math.sin(phase) * 0.9 * decay(i, n, 5) + noise[i]! * 0.5 * decay(i, n, 14);
      }
      return out;
    }
    case 'boom': {
      // Deep rumble + debris noise, long tail.
      const n = seconds(0.95);
      const out = new Float32Array(n);
      const noise = lowpass(noiseFor('boom', n), 0.08);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const f = 60 * (1 - 0.5 * u);
        phase += (TWO_PI * f) / SFX_RATE;
        out[i] = Math.sin(phase) * 0.85 * decay(i, n, 3.2) + noise[i]! * 0.8 * decay(i, n, 4.5);
      }
      return out;
    }
    case 'crowd': {
      // Murmur: many detuned wobbly voices of filtered noise.
      const n = seconds(1.4);
      const out = new Float32Array(n);
      const noise = lowpass(noiseFor('crowd', n), 0.12);
      for (let v = 0; v < 6; v++) {
        const rateHz = 2.1 + v * 0.83;
        for (let i = 0; i < n; i++) {
          const t = i / SFX_RATE;
          out[i]! +=
            noise[(i * (v + 3)) % n]! * (0.5 + 0.5 * Math.sin(TWO_PI * rateHz * t + v)) * 0.3;
        }
      }
      for (let i = 0; i < n; i++) out[i]! *= Math.sin(Math.PI * (i / n)) ** 0.5;
      return out;
    }
    case 'quill': {
      // Scratchy pen ticks.
      const n = seconds(0.5);
      const out = noiseFor('quill', n);
      for (let i = 0; i < n; i++) {
        const t = i / SFX_RATE;
        const scratch = Math.sin(TWO_PI * 11 * t) > 0.15 ? 1 : 0.06;
        out[i]! *= 0.4 * scratch * (0.6 + 0.4 * Math.sin(TWO_PI * 900 * t));
      }
      return out;
    }
    case 'ding': {
      // Bell partials.
      const n = seconds(0.7);
      const out = new Float32Array(n);
      for (const [f, a] of [
        [1180, 0.6],
        [2360, 0.25],
        [3550, 0.12],
      ] as const) {
        for (let i = 0; i < n; i++) {
          out[i]! += Math.sin((TWO_PI * f * i) / SFX_RATE) * a * decay(i, n, 4.5);
        }
      }
      return out;
    }
    case 'drumroll': {
      // Rapid alternating snare-ish hits.
      const n = seconds(1);
      const out = new Float32Array(n);
      const noise = noiseFor('drumroll', n);
      const hit = seconds(1 / 16);
      for (let i = 0; i < n; i++) {
        const inHit = i % hit;
        out[i] = noise[i]! * 0.7 * decay(inHit, hit, 7);
      }
      lowpass(out, 0.55);
      for (let i = 0; i < n; i++) out[i]! *= 0.5 + 0.5 * (i / n);
      return out;
    }
    case 'march': {
      // Left-right boot thumps, loopable over one second.
      const n = seconds(1);
      const out = new Float32Array(n);
      const step = seconds(0.25);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const inStep = i % step;
        const f = 110;
        phase += (TWO_PI * f) / SFX_RATE;
        out[i] = Math.sin(phase) * 0.7 * decay(inStep, step, 9);
      }
      return out;
    }
  }
}

const cache = new Map<string, Float32Array>();

/** Synthesized samples for a cue name; unknown names return silence. */
export function sfxSamples(name: string): Float32Array {
  const known = (SFX_NAMES as readonly string[]).includes(name);
  if (!known) return new Float32Array(0);
  const hit = cache.get(name);
  if (hit) return hit;
  const samples = synth(name as SfxName);
  cache.set(name, samples);
  return samples;
}

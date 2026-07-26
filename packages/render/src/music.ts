/**
 * Procedural music beds (M9.3, ADR-0009): loopable moods synthesized as
 * pure DSP — bass, soft chords, arpeggio, light hats — plus tension
 * stingers. Tempos are chosen so a beat is an integer sample count at
 * 48 kHz, which makes loop cuts sample-exact (no clicks, no drift).
 */

import { Pcg32, fnv1a } from '@motionforge/core';

export const MUSIC_RATE = 48000;

export const MUSIC_MOODS = ['jaunty', 'tense', 'somber', 'triumphant'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export const STINGER_NAMES = ['riser', 'sting'] as const;

const TWO_PI = Math.PI * 2;

/** Semitone (relative A3 = 220 Hz) → frequency. */
const freq = (semitone: number): number => 220 * 2 ** (semitone / 12);

interface MoodSpec {
  /** Samples per beat (integer by construction). */
  readonly beat: number;
  /** Chord roots in semitones, one per bar (4 beats). */
  readonly bars: readonly number[];
  /** Chord intervals over the root. */
  readonly chord: readonly number[];
  /** Arp pattern: chord-note index per eighth note (-1 = rest). */
  readonly arp: readonly number[];
  readonly hats: boolean;
  readonly gain: number;
}

const MOODS: Record<MusicMood, MoodSpec> = {
  // 120 bpm, bright I–V–vi–IV.
  jaunty: {
    beat: 24000,
    bars: [3, 10, 0, 8],
    chord: [0, 4, 7],
    arp: [0, 1, 2, 1, 0, 2, 1, 2],
    hats: true,
    gain: 1,
  },
  // 100 bpm, minor pedal with a lowered second creeping in.
  tense: {
    beat: 28800,
    bars: [0, 0, -2, 1],
    chord: [0, 3, 7],
    arp: [0, -1, 1, -1, 0, -1, 2, 1],
    hats: false,
    gain: 0.9,
  },
  // 80 bpm, slow minor arps.
  somber: {
    beat: 36000,
    bars: [0, -4, -7, -2],
    chord: [0, 3, 7],
    arp: [0, 1, 2, -1, 2, 1, 0, -1],
    hats: false,
    gain: 0.8,
  },
  // 96 bpm, open fifths marching upward.
  triumphant: {
    beat: 30000,
    bars: [0, 5, 7, 12],
    chord: [0, 7, 12],
    arp: [0, 2, 1, 2, 0, 2, 1, 2],
    hats: true,
    gain: 1,
  },
};

const decay = (i: number, length: number, sharpness: number): number =>
  Math.exp((-sharpness * i) / length);

/** One clean 4-bar loop for a mood. Pure and cached. */
export function musicLoop(mood: MusicMood): Float32Array {
  const cached = loopCache.get(mood);
  if (cached) return cached;
  const spec = MOODS[mood];
  const barLen = spec.beat * 4;
  const n = barLen * spec.bars.length;
  const out = new Float32Array(n);
  const rng = new Pcg32(0xbed, BigInt(fnv1a(mood)));
  const eighth = spec.beat / 2;

  for (let bar = 0; bar < spec.bars.length; bar++) {
    const root = spec.bars[bar]!;
    const start = bar * barLen;

    // Bass: root each beat, octave down.
    for (let b = 0; b < 4; b++) {
      const f = freq(root - 24 + (b === 2 ? 7 : 0));
      const s0 = start + b * spec.beat;
      for (let i = 0; i < spec.beat; i++) {
        const t = i / MUSIC_RATE;
        out[s0 + i]! +=
          (Math.sin(TWO_PI * f * t) + 0.3 * Math.sin(TWO_PI * 2 * f * t)) *
          0.22 *
          decay(i, spec.beat, 2.5);
      }
    }

    // Chord pad: soft detuned sines held per bar.
    for (const interval of spec.chord) {
      const f = freq(root + interval - 12);
      for (let i = 0; i < barLen; i++) {
        const t = i / MUSIC_RATE;
        const envelope = Math.sin((Math.PI * i) / barLen) ** 0.4;
        out[start + i]! +=
          (Math.sin(TWO_PI * f * t) + Math.sin(TWO_PI * f * 1.003 * t)) * 0.045 * envelope;
      }
    }

    // Arp: eighth-note plucks over the chord.
    spec.arp.forEach((note, e) => {
      if (note < 0) return;
      const f = freq(root + spec.chord[note % spec.chord.length]!);
      const s0 = start + e * eighth;
      for (let i = 0; i < eighth && s0 + i < n; i++) {
        const t = i / MUSIC_RATE;
        out[s0 + i]! += Math.sin(TWO_PI * f * t) * 0.16 * decay(i, eighth, 6);
      }
    });

    // Hats: seeded ticks on the off-beats.
    if (spec.hats) {
      for (let e = 1; e < 8; e += 2) {
        const s0 = start + e * eighth;
        const len = Math.round(eighth * 0.2);
        for (let i = 0; i < len && s0 + i < n; i++) {
          out[s0 + i]! += (rng.nextFloat() * 2 - 1) * 0.05 * decay(i, len, 8);
        }
      }
    }
  }

  for (let i = 0; i < n; i++) out[i]! *= spec.gain;
  loopCache.set(mood, out);
  return out;
}

const loopCache = new Map<string, Float32Array>();

/** Tile the mood's loop to cover `sampleCount` samples — cut is clean. */
export function musicBed(mood: MusicMood, sampleCount: number): Float32Array {
  const loop = musicLoop(mood);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) out[i] = loop[i % loop.length]!;
  // Gentle fade in/out at the bed's edges (0.25 s).
  const fade = Math.min(Math.round(0.25 * MUSIC_RATE), sampleCount >> 1);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i]! *= g;
    out[sampleCount - 1 - i]! *= g;
  }
  return out;
}

/** Tension stingers: a rising sweep or a hard hit. Pure. */
export function stingerSamples(name: string): Float32Array {
  if (name === 'riser') {
    const n = Math.round(1.6 * MUSIC_RATE);
    const out = new Float32Array(n);
    const rng = new Pcg32(0xbed, BigInt(fnv1a('riser')));
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const f = 90 + 620 * u * u;
      phase += (TWO_PI * f) / MUSIC_RATE;
      const tremolo = 0.6 + 0.4 * Math.sin(TWO_PI * (4 + 14 * u) * (i / MUSIC_RATE));
      out[i] =
        (Math.sin(phase) * 0.5 + (rng.nextFloat() * 2 - 1) * 0.18) * tremolo * (0.25 + 0.75 * u);
    }
    return out;
  }
  if (name === 'sting') {
    const n = Math.round(0.9 * MUSIC_RATE);
    const out = new Float32Array(n);
    for (const [f, a] of [
      [110, 0.5],
      [220, 0.35],
      [331, 0.2],
    ] as const) {
      for (let i = 0; i < n; i++) {
        out[i]! += Math.sin((TWO_PI * f * i) / MUSIC_RATE) * a * decay(i, n, 4);
      }
    }
    return out;
  }
  return new Float32Array(0);
}

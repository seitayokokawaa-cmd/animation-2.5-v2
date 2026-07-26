/**
 * Offline narration mixer (M3.6 + M8.4): places every scene's frozen
 * narration segments and character lines on the film timeline and sums
 * them into one 48 kHz mono WAV — sample-accurate, deterministic, no
 * network. Narration ducks beneath character lines with short ramps so
 * squeaked one-liners always land. The WAV reader is injected (the CLI
 * passes the voice cache) so render stays decoupled from voice.
 */

import { decodeWav, encodeWavPcm16, ticksToSeconds, type Film } from '@motionforge/core';

import { musicBed, MUSIC_MOODS, type MusicMood } from './music.js';

export const MIX_SAMPLE_RATE = 48000;

/** Music bed level relative to narration. */
export const MUSIC_BASE_GAIN = 0.28;

/** Narration gain under an active character line. */
export const DUCK_GAIN = 0.35;
/** Duck ramp length, seconds. */
export const DUCK_RAMP_SECONDS = 0.1;

export interface MixResult {
  readonly wav: Uint8Array;
  readonly segments: number;
}

/** Resample by linear interpolation (only hit when a source isn't 48 kHz). */
function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const outLength = Math.round((samples.length * to) / from);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const src = (i * from) / to;
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, samples.length - 1);
    out[i] = samples[lo]! + (samples[hi]! - samples[lo]!) * (src - lo);
  }
  return out;
}

export function mixNarration(film: Film, readWav: (hash: string) => Uint8Array): MixResult {
  const totalSamples = Math.ceil(ticksToSeconds(film.durationTicks) * MIX_SAMPLE_RATE);
  const mix = new Float32Array(totalSamples);
  let segments = 0;

  // Pass 1: character lines at full gain; remember their windows for ducking.
  const lineTrack = new Float32Array(totalSamples);
  const windows: Array<[number, number]> = [];
  for (const scene of film.scenes) {
    for (const line of scene.lines ?? []) {
      const wav = decodeWav(readWav(line.hash));
      const samples = resample(wav.samples, wav.sampleRate, MIX_SAMPLE_RATE);
      const offset = Math.round(ticksToSeconds(scene.startTick + line.startTick) * MIX_SAMPLE_RATE);
      for (let i = 0; i < samples.length && offset + i < totalSamples; i++) {
        lineTrack[offset + i]! += samples[i]!;
      }
      windows.push([offset, Math.min(totalSamples, offset + samples.length)]);
      segments++;
    }
  }

  const ramp = Math.round(DUCK_RAMP_SECONDS * MIX_SAMPLE_RATE);
  const duckAt = (i: number): number => {
    let gain = 1;
    for (const [start, end] of windows) {
      if (i < start - ramp || i >= end + ramp) continue;
      if (i < start) {
        gain = Math.min(gain, 1 - (1 - DUCK_GAIN) * ((i - (start - ramp)) / ramp));
      } else if (i >= end) {
        gain = Math.min(gain, DUCK_GAIN + (1 - DUCK_GAIN) * ((i - end) / ramp));
      } else {
        gain = Math.min(gain, DUCK_GAIN);
      }
    }
    return gain;
  };

  // Pass 2: narration, ducked under any active line.
  for (const scene of film.scenes) {
    for (const segment of scene.narration) {
      const wav = decodeWav(readWav(segment.hash));
      const samples = resample(wav.samples, wav.sampleRate, MIX_SAMPLE_RATE);
      const offset = Math.round(
        ticksToSeconds(scene.startTick + segment.startTick) * MIX_SAMPLE_RATE,
      );
      for (let i = 0; i < samples.length && offset + i < totalSamples; i++) {
        const at = offset + i;
        mix[at]! += samples[i]! * (windows.length > 0 ? duckAt(at) : 1);
      }
      segments++;
    }
  }

  for (let i = 0; i < mix.length; i++) mix[i]! += lineTrack[i]!;

  // Music beds (M9.3) under each scene, sample-exact loop tiling.
  for (const scene of film.scenes) {
    const music = scene.music;
    if (!music || !(MUSIC_MOODS as readonly string[]).includes(music.mood)) continue;
    const offset = Math.round(ticksToSeconds(scene.startTick) * MIX_SAMPLE_RATE);
    const length = Math.min(
      totalSamples - offset,
      Math.round(ticksToSeconds(scene.durationTicks) * MIX_SAMPLE_RATE),
    );
    if (length <= 0) continue;
    const bed = musicBed(music.mood as MusicMood, length);
    const gain = MUSIC_BASE_GAIN * music.gain;
    for (let i = 0; i < length; i++) mix[offset + i]! += bed[i]! * gain;
  }

  // Hard safety limiter — clipping must be impossible by construction.
  for (let i = 0; i < mix.length; i++) {
    const s = mix[i]!;
    if (s > 1) mix[i] = 1;
    else if (s < -1) mix[i] = -1;
  }

  return { wav: encodeWavPcm16(mix, MIX_SAMPLE_RATE), segments };
}

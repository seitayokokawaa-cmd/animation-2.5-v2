/**
 * Offline narration mixer (M3.6 + M8.4): places every scene's frozen
 * narration segments and character lines on the film timeline and sums
 * them into one 48 kHz mono WAV — sample-accurate, deterministic, no
 * network. Narration ducks beneath character lines with short ramps so
 * squeaked one-liners always land. The WAV reader is injected (the CLI
 * passes the voice cache) so render stays decoupled from voice.
 */

import { decodeWav, encodeWavPcm16, ticksToSeconds, type Film } from '@motionforge/core';

import { collectCues } from './audio.js';
import { musicBed, MUSIC_MOODS, stingerSamples, type MusicMood } from './music.js';
import { sfxSamples } from './sfx.js';

export const MIX_SAMPLE_RATE = 48000;

/** Music bed level relative to narration. */
export const MUSIC_BASE_GAIN = 0.28;

/** SFX cue level relative to narration. */
export const SFX_BASE_GAIN = 0.75;

/** Narration gain under an active character line. */
export const DUCK_GAIN = 0.35;
/** Duck ramp length, seconds. */
export const DUCK_RAMP_SECONDS = 0.1;

/** Music gain under any voice-over. */
export const MUSIC_DUCK_GAIN = 0.35;
/** Music duck ramp, seconds. */
export const MUSIC_DUCK_RAMP_SECONDS = 0.18;
/** VO leveling target RMS; per-segment gain is clamped to [0.5, 2]. */
export const VO_TARGET_RMS = 0.09;

export interface MixResult {
  readonly wav: Uint8Array;
  readonly segments: number;
}

/** Per-sample gain that dips to `floor` inside any window, with ramps. */
const windowGain =
  (windows: readonly (readonly [number, number])[], ramp: number, floor: number) =>
  (i: number): number => {
    let gain = 1;
    for (const [start, end] of windows) {
      if (i < start - ramp || i >= end + ramp) continue;
      if (i < start) {
        gain = Math.min(gain, 1 - (1 - floor) * ((i - (start - ramp)) / ramp));
      } else if (i >= end) {
        gain = Math.min(gain, floor + (1 - floor) * ((i - end) / ramp));
      } else {
        gain = Math.min(gain, floor);
      }
    }
    return gain;
  };

/** VO leveling (M9.4): bring a segment toward the target RMS, gently. */
export function levelGain(samples: Float32Array, targetRms = VO_TARGET_RMS): number {
  if (samples.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sum / samples.length);
  if (rms < 1e-6) return 1;
  return Math.min(2, Math.max(0.5, targetRms / rms));
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

  // Pass 1: character lines, leveled, at full gain; their windows duck the
  // narration (M8.4) and, together with narration, duck the music (M9.4).
  const lineTrack = new Float32Array(totalSamples);
  const lineWindows: Array<[number, number]> = [];
  const voWindows: Array<[number, number]> = [];
  for (const scene of film.scenes) {
    for (const line of scene.lines ?? []) {
      const wav = decodeWav(readWav(line.hash));
      const samples = resample(wav.samples, wav.sampleRate, MIX_SAMPLE_RATE);
      const gain = levelGain(samples);
      const offset = Math.round(ticksToSeconds(scene.startTick + line.startTick) * MIX_SAMPLE_RATE);
      for (let i = 0; i < samples.length && offset + i < totalSamples; i++) {
        lineTrack[offset + i]! += samples[i]! * gain;
      }
      const window: [number, number] = [offset, Math.min(totalSamples, offset + samples.length)];
      lineWindows.push(window);
      voWindows.push(window);
      segments++;
    }
  }

  const lineDuck = windowGain(
    lineWindows,
    Math.round(DUCK_RAMP_SECONDS * MIX_SAMPLE_RATE),
    DUCK_GAIN,
  );

  // Pass 2: narration, leveled, ducked under any active line.
  for (const scene of film.scenes) {
    for (const segment of scene.narration) {
      const wav = decodeWav(readWav(segment.hash));
      const samples = resample(wav.samples, wav.sampleRate, MIX_SAMPLE_RATE);
      const gain = levelGain(samples);
      const offset = Math.round(
        ticksToSeconds(scene.startTick + segment.startTick) * MIX_SAMPLE_RATE,
      );
      for (let i = 0; i < samples.length && offset + i < totalSamples; i++) {
        const at = offset + i;
        mix[at]! += samples[i]! * gain * (lineWindows.length > 0 ? lineDuck(at) : 1);
      }
      voWindows.push([offset, Math.min(totalSamples, offset + samples.length)]);
      segments++;
    }
  }

  for (let i = 0; i < mix.length; i++) mix[i]! += lineTrack[i]!;

  // Music beds (M9.3) under each scene, sample-exact loop tiling, ducked
  // beneath every stretch of voice-over (M9.4).
  const musicDuck = windowGain(
    voWindows,
    Math.round(MUSIC_DUCK_RAMP_SECONDS * MIX_SAMPLE_RATE),
    MUSIC_DUCK_GAIN,
  );
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
    for (let i = 0; i < length; i++) {
      const at = offset + i;
      mix[at]! += bed[i]! * gain * (voWindows.length > 0 ? musicDuck(at) : 1);
    }
  }

  // SFX cues off the audio bus (M9.1/M9.2/M9.5): synthesized library
  // sounds and stingers placed at their ticks. Unknown names are silent
  // here — naming them is the validator's job (M12).
  for (const cue of collectCues(film)) {
    const library = sfxSamples(cue.name);
    const samples = library.length > 0 ? library : stingerSamples(cue.name);
    if (samples.length === 0) continue;
    const offset = Math.round(ticksToSeconds(cue.tick) * MIX_SAMPLE_RATE);
    for (let i = 0; i < samples.length && offset + i < totalSamples; i++) {
      mix[offset + i]! += samples[i]! * SFX_BASE_GAIN * cue.gain;
    }
  }

  // Hard safety limiter — clipping must be impossible by construction.
  for (let i = 0; i < mix.length; i++) {
    const s = mix[i]!;
    if (s > 1) mix[i] = 1;
    else if (s < -1) mix[i] = -1;
  }

  return { wav: encodeWavPcm16(mix, MIX_SAMPLE_RATE), segments };
}

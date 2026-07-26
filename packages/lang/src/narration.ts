/**
 * Narration schema (M3.1) — the MFS v2 spine. A film may declare `voices:`
 * and scenes may carry `narration:` segments whose `sync:` entries anchor
 * actions to spoken phrases. Scene duration derives from narration audio
 * when `duration` is omitted (resolved against the voice cache at compile).
 */

import { canonicalWord, tokenizeWords } from '@motionforge/core';
import { z } from 'zod';

/** Engines the voice package implements (ADR-0006). */
export const TTS_ENGINES = [
  'qwen-audio-3.0-tts-plus',
  'qwen-audio-3.0-tts-flash',
  'recorded',
  'mock',
] as const;

export const voiceSpecSchema = z
  .object({
    engine: z.enum(TTS_ENGINES),
    /** Engine voice preset id (qwen), file stem (recorded), or tone (mock). */
    voice: z.string().min(1),
    /** Speaking-rate multiplier. */
    rate: z.number().finite().positive().optional(),
    /** Pitch shift in semitones, e.g. +5 for squeaky characters. */
    pitch: z.number().finite().optional(),
  })
  .strict();

export type MfsVoiceSpec = z.infer<typeof voiceSpecSchema>;

/** `on:` — first occurrence of the phrase, or { phrase, nth } for repeats. */
export const anchorSchema = z.union([
  z.string().min(1),
  z
    .object({
      phrase: z.string().min(1),
      /** 1-based occurrence index. */
      nth: z.number().int().positive(),
    })
    .strict(),
]);

export type MfsAnchor = z.infer<typeof anchorSchema>;

export interface NarrationSyncShape {
  on: MfsAnchor;
  /** Fine timing tweak in seconds relative to the anchored word start. */
  offset?: number | undefined;
}

/**
 * Builds the narration schema around a verb schema supplied by the caller
 * (the v0 action verbs today; richer verbs as milestones land) so this
 * module has no dependency on the action vocabulary.
 */
export function makeNarrationSchema<V extends z.ZodTypeAny>(verbSchema: V) {
  const syncSchema = z
    .object({
      on: anchorSchema,
      offset: z.number().finite().optional(),
      do: verbSchema,
    })
    .strict();

  const segmentSchema = z
    .object({
      voice: z.string().min(1),
      text: z.string().min(1),
      /** Silence appended after the segment, seconds. Default 0.3. */
      pause: z.number().finite().nonnegative().optional(),
      sync: z.array(syncSchema).default([]),
    })
    .strict();

  return z.array(segmentSchema);
}

/** Split narration text into the word tokens sync anchors bind against. */
export const narrationWords = tokenizeWords;

/**
 * Find the word index where the anchor phrase starts.
 * Returns all occurrence start indices (callers pick nth / report ambiguity).
 */
export function findPhrase(words: readonly string[], phrase: string): number[] {
  const needle = narrationWords(phrase).map(canonicalWord);
  if (needle.length === 0) return [];
  const hay = words.map(canonicalWord);
  const hits: number[] = [];
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

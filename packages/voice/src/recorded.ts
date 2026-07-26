/**
 * Recorded-VO adapter (ADR-0006): user-supplied WAV per segment — the
 * first-class path for languages without a TTS voice (Bengali) and for
 * human narrators. `spec.voice` names the file stem inside the recordings
 * directory; the file is validated (decodable PCM16 WAV) and then frozen
 * into the cache exactly like synthesized audio, alignment included.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { decodeWav } from '@motionforge/core';

import type { TtsAdapter } from './adapter.js';

export function createRecordedAdapter(recordingsDir: string): TtsAdapter {
  return {
    name: 'recorded',
    synthesize(_text, spec) {
      const path = join(recordingsDir, `${spec.voice}.wav`);
      if (!existsSync(path)) {
        return Promise.reject(
          new Error(
            `Recorded VO file missing: ${path}. Drop a mono PCM16 WAV there (the "voice" field names the file stem).`,
          ),
        );
      }
      const bytes = new Uint8Array(readFileSync(path));
      decodeWav(bytes); // validate early: fail at sync time, not at mix time
      return Promise.resolve(bytes);
    },
  };
}

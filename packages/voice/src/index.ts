export const PACKAGE_NAME = '@motionforge/voice';

export * from './adapter.js';
export * from './mock.js';
export * from './cache.js';
export * from './align.js';
export * from './qwen.js';
export * from './recorded.js';

import type { TtsAdapter } from './adapter.js';
import { mockAdapter } from './mock.js';
import { qwenFlashAdapter, qwenPlusAdapter } from './qwen.js';
import { createRecordedAdapter } from './recorded.js';

export interface AdapterOptions {
  /** Directory holding recorded-VO WAVs; default `assets/voice/recorded`. */
  readonly recordedDir?: string;
}

/** Engine name (MFS `voices.*.engine`) → adapter. */
export function adapterFor(engine: string, options: AdapterOptions = {}): TtsAdapter {
  switch (engine) {
    case 'mock':
      return mockAdapter;
    case 'recorded':
      return createRecordedAdapter(options.recordedDir ?? 'assets/voice/recorded');
    case 'qwen-audio-3.0-tts-plus':
      return qwenPlusAdapter;
    case 'qwen-audio-3.0-tts-flash':
      return qwenFlashAdapter;
    default:
      throw new Error(`No TTS adapter for engine ${JSON.stringify(engine)}`);
  }
}

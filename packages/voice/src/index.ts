export const PACKAGE_NAME = '@motionforge/voice';

export * from './adapter.js';
export * from './wav.js';
export * from './mock.js';
export * from './cache.js';
export * from './qwen.js';

import type { TtsAdapter } from './adapter.js';
import { mockAdapter } from './mock.js';
import { qwenFlashAdapter, qwenPlusAdapter } from './qwen.js';

/** Engine name (MFS `voices.*.engine`) → adapter. `recorded` lands in M3.6. */
export function adapterFor(engine: string): TtsAdapter {
  switch (engine) {
    case 'mock':
      return mockAdapter;
    case 'qwen-audio-3.0-tts-plus':
      return qwenPlusAdapter;
    case 'qwen-audio-3.0-tts-flash':
      return qwenFlashAdapter;
    default:
      throw new Error(`No TTS adapter for engine ${JSON.stringify(engine)}`);
  }
}

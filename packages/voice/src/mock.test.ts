import { describe, expect, it } from 'vitest';

import { adapterFor } from './index.js';
import { MOCK_SAMPLE_RATE, mockAdapter, mockDurationSeconds } from './mock.js';
import { decodeWav, encodeWavPcm16, wavDurationSeconds } from '@motionforge/core';

const spec = { engine: 'mock', voice: 'warm' };

describe('wav codec', () => {
  it('round-trips PCM16 mono', () => {
    const samples = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 10) * 0.5);
    const wav = decodeWav(encodeWavPcm16(samples, 48000));
    expect(wav.sampleRate).toBe(48000);
    expect(wav.samples.length).toBe(480);
    expect(wav.samples[5]).toBeCloseTo(samples[5]!, 3);
  });

  it('rejects junk', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow(/RIFF/);
  });
});

describe('mockAdapter', () => {
  it('is byte-deterministic', async () => {
    const a = await mockAdapter.synthesize('By 1914 Europe was armed', spec);
    const b = await mockAdapter.synthesize('By 1914 Europe was armed', spec);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('duration matches its model and scales with rate', async () => {
    const text = 'one two three four';
    const wav = decodeWav(await mockAdapter.synthesize(text, spec));
    expect(wav.sampleRate).toBe(MOCK_SAMPLE_RATE);
    expect(wavDurationSeconds(wav)).toBeCloseTo(mockDurationSeconds(text, spec), 2);
    const fast = decodeWav(await mockAdapter.synthesize(text, { ...spec, rate: 2 }));
    expect(wavDurationSeconds(fast)).toBeCloseTo(mockDurationSeconds(text, spec) / 2, 2);
  });

  it('different voices/texts produce different audio', async () => {
    const a = await mockAdapter.synthesize('hello', spec);
    const b = await mockAdapter.synthesize('hello', { ...spec, voice: 'bright' });
    const c = await mockAdapter.synthesize('goodbye', spec);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
  });
});

describe('adapterFor', () => {
  it('resolves engines and rejects unknown ones', () => {
    expect(adapterFor('mock').name).toBe('mock');
    expect(adapterFor('qwen-audio-3.0-tts-plus').name).toBe('qwen-audio-3.0-tts-plus');
    expect(() => adapterFor('espeak')).toThrow(/No TTS adapter/);
  });

  it('qwen adapter fails fast without an API key (no network)', async () => {
    const saved = process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    try {
      await expect(
        adapterFor('qwen-audio-3.0-tts-flash').synthesize('hi', {
          engine: 'qwen-audio-3.0-tts-flash',
          voice: 'preset-warm-m',
        }),
      ).rejects.toThrow(/DASHSCOPE_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.DASHSCOPE_API_KEY = saved;
    }
  });
});

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { adapterFor } from './index.js';
import {
  isStale,
  readLock,
  segmentHash,
  syncSegments,
  VoiceCache,
  writeLock,
  type SegmentRequest,
} from './cache.js';

const dir = mkdtempSync(join(tmpdir(), 'mf-voice-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const spec = { engine: 'mock', voice: 'warm' };
const requests: SegmentRequest[] = [
  { key: 'setup/0', text: 'By 1914 Europe was armed', spec },
  { key: 'setup/1', text: 'This was fine', spec: { ...spec, voice: 'bright', pitch: 5 } },
];

describe('freeze cache', () => {
  const cache = new VoiceCache(join(dir, 'cache'));

  it('first sync synthesizes everything and writes hashed wavs', async () => {
    const result = await syncSegments(requests, cache, adapterFor);
    expect(result.synthesized).toEqual(['setup/0', 'setup/1']);
    expect(result.reused).toEqual([]);
    const files = readdirSync(join(dir, 'cache'));
    expect(files).toHaveLength(2);
    for (const entry of Object.values(result.lock.segments)) {
      expect(files).toContain(`${entry.hash}.wav`);
      expect(entry.durationSeconds).toBeGreaterThan(0);
    }
  });

  it('second sync is a pure cache hit — zero synthesis, byte-stable', async () => {
    const before = readdirSync(join(dir, 'cache'))
      .sort()
      .map((f) => readFileSync(join(dir, 'cache', f)));
    const result = await syncSegments(requests, cache, adapterFor);
    expect(result.synthesized).toEqual([]);
    expect(result.reused).toEqual(['setup/0', 'setup/1']);
    const after = readdirSync(join(dir, 'cache'))
      .sort()
      .map((f) => readFileSync(join(dir, 'cache', f)));
    expect(after.length).toBe(before.length);
    after.forEach((buf, i) => expect(buf.equals(before[i]!)).toBe(true));
  });

  it('changing text or voice changes the hash (re-record = new file)', () => {
    const base = segmentHash(spec, 'hello');
    expect(segmentHash(spec, 'hello!')).not.toBe(base);
    expect(segmentHash({ ...spec, voice: 'other' }, 'hello')).not.toBe(base);
    expect(segmentHash({ ...spec, rate: 1.1 }, 'hello')).not.toBe(base);
    expect(segmentHash({ ...spec, pitch: 2 }, 'hello')).not.toBe(base);
  });

  it('detects stale lock entries', async () => {
    const { lock } = await syncSegments(requests, cache, adapterFor);
    const entry = lock.segments['setup/0'];
    expect(isStale(entry, spec, 'By 1914 Europe was armed')).toBe(false);
    expect(isStale(entry, spec, 'By 1915 Europe was armed')).toBe(true);
    expect(isStale(undefined, spec, 'anything')).toBe(true);
  });

  it('lock round-trips deterministically with sorted keys', async () => {
    const { lock } = await syncSegments([...requests].reverse(), cache, adapterFor);
    const lockPath = join(dir, 'film.voice.lock.json');
    writeLock(lockPath, lock);
    const text1 = readFileSync(lockPath, 'utf8');
    writeLock(lockPath, readLock(lockPath));
    expect(readFileSync(lockPath, 'utf8')).toBe(text1);
    expect(Object.keys(readLock(lockPath).segments)).toEqual(['setup/0', 'setup/1']);
  });

  it('cache miss fails loudly with the fix hint', () => {
    expect(() => cache.readWav('0'.repeat(64))).toThrow(/mf voice sync/);
  });
});

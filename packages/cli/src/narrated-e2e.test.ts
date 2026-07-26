/**
 * M3.8 e2e: the narrated example checks clean against its committed voice
 * cache, compiles with narration-derived durations, and produces frames.
 * (CI renders the full MP4 as a workflow artifact; encode determinism is
 * covered by the 01-shapes double-render.)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  check,
  compileWithMarkers,
  type NarrationCacheProbe,
  type VoiceData,
} from '@motionforge/lang';
import { buildFrameSvg } from '@motionforge/render';
import { isStale, readLock, VoiceCache } from '@motionforge/voice';
import { describe, expect, it } from 'vitest';

const repo = join(import.meta.dirname, '../../..');
const exampleFile = join(repo, 'examples/03-narrated.mfs.yaml');
const lockFile = join(repo, 'examples/03-narrated.voice.lock.json');
const cache = new VoiceCache(join(repo, 'assets/voice'));
const lock = readLock(lockFile);

const cacheProbe: NarrationCacheProbe = {
  probe(key, spec, text) {
    const entry = lock.segments[key];
    if (!entry || !cache.hasWav(entry.hash)) return 'missing';
    return isStale(entry, spec, text) ? 'stale' : 'ok';
  },
};

const voiceData: VoiceData = {
  segment(key) {
    const entry = lock.segments[key];
    if (!entry) return undefined;
    return {
      hash: entry.hash,
      durationSeconds: entry.durationSeconds,
      words: cache.readAlign(entry.hash).words,
    };
  },
};

describe('examples/03-narrated end to end', () => {
  const text = readFileSync(exampleFile, 'utf8');

  it('checks clean against the committed voice cache (no stale segments)', () => {
    const result = check(text, 'examples/03-narrated.mfs.yaml', { cacheProbe });
    expect(result.findings).toEqual([]);
  });

  it('compiles with narration-derived scene durations and 5 segments', () => {
    const { film, markers } = compileWithMarkers(check(text, 'x', { cacheProbe }).doc!, voiceData);
    expect(film.scenes).toHaveLength(4);
    expect(film.scenes.reduce((n, s) => n + s.narration.length, 0)).toBe(5);
    // Every scene derives its duration from narration (none declared).
    for (const scene of film.scenes) expect(scene.durationTicks).toBeGreaterThan(0);
    // ~37 s of film.
    expect(film.durationTicks / 120).toBeGreaterThan(30);
    expect(film.durationTicks / 120).toBeLessThan(50);
    // Sync markers exist and sit inside the film.
    const syncMarkers = markers.filter((m) => m.kind === 'sync');
    expect(syncMarkers.length).toBe(16);
    for (const m of syncMarkers) expect(m.tick).toBeLessThan(film.durationTicks);
  });

  it('builds deterministic frames at sync moments', () => {
    const { film, markers } = compileWithMarkers(check(text, 'x').doc!, voiceData);
    const firstSync = markers.find((m) => m.kind === 'sync')!;
    expect(buildFrameSvg(film, firstSync.tick)).toBe(buildFrameSvg(film, firstSync.tick));
  });
});

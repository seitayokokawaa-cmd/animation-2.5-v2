/**
 * Freeze-cache (ADR-0006). Synthesized narration is frozen by content hash
 * the moment it's fetched: `<cacheDir>/<sha256(engine,voice,params,text)>.wav`
 * (+ `.align.json` from M3.4), with a per-film `*.voice.lock.json` mapping
 * segment keys → hashes. `mf voice sync` is the only writer; rendering
 * reads the cache and fails loudly on a miss.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TtsAdapter, VoiceSpec } from './adapter.js';
import { decodeWav, wavDurationSeconds } from './wav.js';

export interface SegmentRequest {
  /** Stable segment key, e.g. `setup/0` (sceneId/segmentIndex). */
  readonly key: string;
  readonly text: string;
  readonly spec: VoiceSpec;
}

export interface LockEntry {
  readonly hash: string;
  readonly engine: string;
  readonly voice: string;
  readonly rate?: number;
  readonly pitch?: number;
  readonly durationSeconds: number;
  readonly text: string;
}

export interface VoiceLock {
  readonly version: 1;
  readonly segments: Record<string, LockEntry>;
}

/** Content hash that freezes a synthesized segment. */
export function segmentHash(spec: VoiceSpec, text: string): string {
  return createHash('sha256')
    .update(JSON.stringify([spec.engine, spec.voice, spec.rate ?? 1, spec.pitch ?? 0, text]))
    .digest('hex');
}

export const EMPTY_LOCK: VoiceLock = { version: 1, segments: {} };

export function readLock(path: string): VoiceLock {
  if (!existsSync(path)) return EMPTY_LOCK;
  return JSON.parse(readFileSync(path, 'utf8')) as VoiceLock;
}

/** Deterministic serialization: sorted segment keys, stable field order. */
export function writeLock(path: string, lock: VoiceLock): void {
  const segments = Object.fromEntries(
    Object.keys(lock.segments)
      .sort()
      .map((key) => [key, lock.segments[key]!]),
  );
  writeFileSync(path, JSON.stringify({ version: 1, segments }, null, 2) + '\n');
}

export class VoiceCache {
  constructor(readonly dir: string) {}

  wavPath(hash: string): string {
    return join(this.dir, `${hash}.wav`);
  }

  alignPath(hash: string): string {
    return join(this.dir, `${hash}.align.json`);
  }

  hasWav(hash: string): boolean {
    return existsSync(this.wavPath(hash));
  }

  /** Read a frozen WAV; a miss is an offline-render contract violation. */
  readWav(hash: string): Uint8Array {
    if (!this.hasWav(hash)) {
      throw new Error(
        `Voice cache miss: ${this.wavPath(hash)}. Run \`mf voice sync <film>\` (the only networked command) and commit the cache.`,
      );
    }
    return new Uint8Array(readFileSync(this.wavPath(hash)));
  }

  writeWav(hash: string, wav: Uint8Array): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.wavPath(hash), wav);
  }
}

export interface SyncResult {
  readonly lock: VoiceLock;
  readonly synthesized: readonly string[];
  readonly reused: readonly string[];
}

/**
 * Ensure every requested segment is frozen in the cache; returns the new
 * lock (stale keys pruned). `adapterFor` is injected so this module stays
 * network-agnostic and testable.
 */
export async function syncSegments(
  requests: readonly SegmentRequest[],
  cache: VoiceCache,
  adapterFor: (engine: string) => TtsAdapter,
): Promise<SyncResult> {
  const segments: Record<string, LockEntry> = {};
  const synthesized: string[] = [];
  const reused: string[] = [];

  for (const request of requests) {
    const hash = segmentHash(request.spec, request.text);
    let wav: Uint8Array;
    if (cache.hasWav(hash)) {
      reused.push(request.key);
      wav = cache.readWav(hash);
    } else {
      const adapter = adapterFor(request.spec.engine);
      wav = await adapter.synthesize(request.text, request.spec);
      cache.writeWav(hash, wav);
      synthesized.push(request.key);
    }
    segments[request.key] = {
      hash,
      engine: request.spec.engine,
      voice: request.spec.voice,
      ...(request.spec.rate !== undefined ? { rate: request.spec.rate } : {}),
      ...(request.spec.pitch !== undefined ? { pitch: request.spec.pitch } : {}),
      durationSeconds: wavDurationSeconds(decodeWav(wav)),
      text: request.text,
    };
  }

  return { lock: { version: 1, segments }, synthesized, reused };
}

/**
 * A lock entry is stale when the screenplay's current (spec, text) no longer
 * hashes to what the lock recorded — the validator's stale-cache signal.
 */
export function isStale(entry: LockEntry | undefined, spec: VoiceSpec, text: string): boolean {
  return !entry || entry.hash !== segmentHash(spec, text);
}

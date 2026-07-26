/**
 * Response caching (M13.5): a content-addressed store wrapped around any
 * adapter. Author runs write every response under the run's artifacts
 * directory, so a crashed or re-invoked run replays finished passes for
 * free and resumes at the first genuinely new request — same mechanism,
 * live or mock.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LlmAdapter, LlmRequest } from './llm.js';

export interface ResponseStore {
  get(key: string): string | undefined;
  put(key: string, value: string): void;
}

/** One JSON file per response, keyed by request hash. */
export class FileResponseStore implements ResponseStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private path(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  get(key: string): string | undefined {
    const file = this.path(key);
    if (!existsSync(file)) return undefined;
    return (JSON.parse(readFileSync(file, 'utf8')) as { response: string }).response;
  }

  put(key: string, value: string): void {
    writeFileSync(this.path(key), JSON.stringify({ response: value }, null, 2));
  }
}

/** In-memory store for tests and one-shot runs. */
export class MemoryResponseStore implements ResponseStore {
  private readonly map = new Map<string, string>();
  get(key: string): string | undefined {
    return this.map.get(key);
  }
  put(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** Stable content hash of a request (adapter name + prompt + images). */
export function requestKey(adapterName: string, request: LlmRequest): string {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      adapter: adapterName,
      system: request.system,
      messages: request.messages,
      maxTokens: request.maxTokens ?? null,
    }),
  );
  for (const image of request.images ?? []) hash.update(image);
  return hash.digest('hex');
}

/** Wrap an adapter: identical requests replay from the store. */
export function cachedAdapter(inner: LlmAdapter, store: ResponseStore): LlmAdapter {
  return {
    name: `cached(${inner.name})`,
    async complete(request) {
      const key = requestKey(inner.name, request);
      const hit = store.get(key);
      if (hit !== undefined) return hit;
      const response = await inner.complete(request);
      store.put(key, response);
      return response;
    },
  };
}

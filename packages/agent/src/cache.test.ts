import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cachedAdapter, FileResponseStore, MemoryResponseStore, requestKey } from './cache.js';
import { MockLlmAdapter, type LlmRequest } from './llm.js';

const req = (content: string, images?: Uint8Array[]): LlmRequest => ({
  system: 's',
  messages: [{ role: 'user', content }],
  ...(images ? { images } : {}),
});

describe('response caching (M13.5)', () => {
  it('keys are stable, and sensitive to prompt, adapter, and images', () => {
    expect(requestKey('a', req('x'))).toBe(requestKey('a', req('x')));
    expect(requestKey('a', req('x'))).not.toBe(requestKey('a', req('y')));
    expect(requestKey('a', req('x'))).not.toBe(requestKey('b', req('x')));
    expect(requestKey('a', req('x', [Uint8Array.from([1])]))).not.toBe(
      requestKey('a', req('x', [Uint8Array.from([2])])),
    );
  });

  it('replays identical requests without touching the inner adapter', async () => {
    const inner = new MockLlmAdapter(['only answer']);
    const adapter = cachedAdapter(inner, new MemoryResponseStore());
    expect(await adapter.complete(req('q'))).toBe('only answer');
    // Second identical call: transcript is exhausted, so a live hit throws —
    // the cache must answer instead.
    expect(await adapter.complete(req('q'))).toBe('only answer');
    expect(inner.requests).toHaveLength(1);
  });

  it('a fresh adapter over the same file store resumes a crashed run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-llm-cache-'));
    try {
      const first = cachedAdapter(new MockLlmAdapter(['pass one']), new FileResponseStore(dir));
      expect(await first.complete(req('script pass'))).toBe('pass one');
      // "Restarted" run: new adapter instance, empty transcript — the
      // store answers the finished pass, the new response comes live.
      const resumed = cachedAdapter(new MockLlmAdapter(['pass two']), new FileResponseStore(dir));
      expect(await resumed.complete(req('script pass'))).toBe('pass one');
      expect(await resumed.complete(req('direction pass'))).toBe('pass two');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

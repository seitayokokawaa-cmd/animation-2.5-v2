import { describe, expect, it } from 'vitest';

import { anthropicAdapter, buildAnthropicBody, DEFAULT_ANTHROPIC_MODEL } from './anthropic.js';
import { MockLlmAdapter } from './llm.js';

describe('llm adapters (M13.1)', () => {
  it('the mock replays its transcript in order and records requests', async () => {
    const mock = new MockLlmAdapter(['first', 'second']);
    const one = await mock.complete({ system: 's', messages: [{ role: 'user', content: 'a' }] });
    const two = await mock.complete({ system: 's', messages: [{ role: 'user', content: 'b' }] });
    expect([one, two]).toEqual(['first', 'second']);
    expect(mock.requests.map((r) => r.messages[0]!.content)).toEqual(['a', 'b']);
    await expect(
      mock.complete({ system: 's', messages: [{ role: 'user', content: 'c' }] }),
    ).rejects.toThrow(/transcript exhausted/);
  });

  it('builds Anthropic bodies with system, model, and plain messages', () => {
    const body = buildAnthropicBody(
      {
        system: 'You write films.',
        messages: [
          { role: 'user', content: 'topic' },
          { role: 'assistant', content: 'draft' },
          { role: 'user', content: 'fix it' },
        ],
        maxTokens: 999,
      },
      DEFAULT_ANTHROPIC_MODEL,
    );
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.max_tokens).toBe(999);
    expect(body.system).toBe('You write films.');
    expect(body.messages).toEqual([
      { role: 'user', content: 'topic' },
      { role: 'assistant', content: 'draft' },
      { role: 'user', content: 'fix it' },
    ]);
  });

  it('attaches images as base64 blocks on the last user message', () => {
    const body = buildAnthropicBody(
      {
        system: 's',
        messages: [{ role: 'user', content: 'judge this frame' }],
        images: [Uint8Array.from([1, 2, 3])],
      },
      'm',
    );
    const content = (body.messages as Array<{ content: unknown }>)[0]!.content as Array<{
      type: string;
      source?: { data: string };
    }>;
    expect(content).toHaveLength(2);
    expect(content[0]!.type).toBe('image');
    expect(content[0]!.source!.data).toBe(Buffer.from([1, 2, 3]).toString('base64'));
    expect(content[1]).toEqual({ type: 'text', text: 'judge this frame' });
  });

  it('the Anthropic adapter refuses to run without a key', async () => {
    const adapter = anthropicAdapter({});
    await expect(
      adapter.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(adapter.name).toBe(`anthropic/${DEFAULT_ANTHROPIC_MODEL}`);
  });
});

/**
 * Anthropic adapter (M13.1): the Messages API over plain fetch — no SDK
 * dependency, nothing new to pin. Needs ANTHROPIC_API_KEY; the model
 * comes from MOTIONFORGE_LLM_MODEL (default claude-sonnet-5).
 */

import type { LlmAdapter, LlmRequest } from './llm.js';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

interface ContentBlock {
  readonly type: 'text' | 'image';
  readonly text?: string;
  readonly source?: { type: 'base64'; media_type: 'image/png'; data: string };
}

/** The exact request body — pure, so tests cover it without a network. */
export function buildAnthropicBody(request: LlmRequest, model: string): Record<string, unknown> {
  const messages = request.messages.map((message, index) => {
    const last = index === request.messages.length - 1;
    if (!last || message.role !== 'user' || !request.images?.length) {
      return { role: message.role, content: message.content };
    }
    const blocks: ContentBlock[] = [
      ...request.images.map((png): ContentBlock => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: Buffer.from(png).toString('base64'),
        },
      })),
      { type: 'text', text: message.content },
    ];
    return { role: message.role, content: blocks };
  });
  return {
    model,
    max_tokens: request.maxTokens ?? 4096,
    system: request.system,
    messages,
  };
}

export function anthropicAdapter(env: NodeJS.ProcessEnv = process.env): LlmAdapter {
  const key = env.ANTHROPIC_API_KEY;
  const model = env.MOTIONFORGE_LLM_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  return {
    name: `anthropic/${model}`,
    async complete(request) {
      if (!key) {
        throw new Error('ANTHROPIC_API_KEY is not set — export it, or run with the mock adapter');
      }
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(buildAnthropicBody(request, model)),
      });
      if (!response.ok) {
        throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
      }
      const data = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
      };
      return data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
    },
  };
}

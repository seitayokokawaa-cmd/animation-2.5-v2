/**
 * LLM adapter interface (M13.1, plan §5.10). The author loop talks to
 * models only through this seam, so CI runs on the mock transcript
 * adapter and the same loop drives Anthropic in production. Adapters are
 * stateless; caching wraps them (M13.5).
 */

export interface LlmMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface LlmRequest {
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  /** Default 4096. */
  readonly maxTokens?: number;
  /** PNG frames for vision critique passes (M13.4); attached to the last
   * user message. */
  readonly images?: readonly Uint8Array[];
}

export interface LlmAdapter {
  readonly name: string;
  complete(request: LlmRequest): Promise<string>;
}

/**
 * Mock transcript adapter: replays a scripted sequence of responses.
 * Deterministic and offline — the CI e2e (M13.6) runs the whole author
 * loop on one of these. Records every request for assertions.
 */
export class MockLlmAdapter implements LlmAdapter {
  readonly name = 'mock';
  readonly requests: LlmRequest[] = [];
  private cursor = 0;

  constructor(private readonly responses: readonly string[]) {}

  complete(request: LlmRequest): Promise<string> {
    this.requests.push(request);
    const response = this.responses[this.cursor];
    if (response === undefined) {
      return Promise.reject(
        new Error(
          `Mock transcript exhausted after ${this.cursor} response(s) — the loop asked one more question than the transcript scripted`,
        ),
      );
    }
    this.cursor++;
    return Promise.resolve(response);
  }
}

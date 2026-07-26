import { describe, expect, it } from 'vitest';

import { authorFilm, extractYaml, type AuthorFinding, type AuthorTools } from './author.js';
import { MockLlmAdapter } from './llm.js';

const SCRIPT = '```yaml\nmotionforge: 2\nscenes: [script]\n```';
const DIRECTED = '```yaml\nmotionforge: 2\nscenes: [directed]\n```';
const FIXED = '```yaml\nmotionforge: 2\nscenes: [fixed]\n```';

interface ToolLog {
  saved: Record<string, string>;
  synced: string[];
  rendered: string[];
}

const fakeTools = (checkResults: (readonly AuthorFinding[])[]): AuthorTools & ToolLog => {
  const log: ToolLog = { saved: {}, synced: [], rendered: [] };
  let checkCalls = 0;
  return {
    ...log,
    check: () => checkResults[Math.min(checkCalls++, checkResults.length - 1)]!,
    voiceSync: (yaml) => {
      log.synced.push(yaml);
      return Promise.resolve();
    },
    render: (yaml) => {
      log.rendered.push(yaml);
      return Promise.resolve('out/film.mp4');
    },
    save: (name, content) => {
      log.saved[name] = content;
    },
  };
};

const OPTIONS = { topic: 'the war', spec: 'THE SPEC', styleGuide: 'THE GUIDE' };

describe('author loop (M13.3)', () => {
  it('extractYaml strips fences and passes raw text through', () => {
    expect(extractYaml(SCRIPT)).toBe('motionforge: 2\nscenes: [script]\n');
    expect(extractYaml('motionforge: 2\n')).toBe('motionforge: 2\n');
  });

  it('runs script → direction → sync → check → render when clean', async () => {
    const llm = new MockLlmAdapter([SCRIPT, DIRECTED]);
    const tools = fakeTools([[]]);
    const result = await authorFilm(llm, tools, OPTIONS);
    expect(result.fixAttempts).toBe(0);
    expect(result.outPath).toBe('out/film.mp4');
    expect(result.yaml).toContain('[directed]');
    // Both passes quote the committed documents.
    expect(llm.requests[0]!.system).toContain('THE GUIDE');
    expect(llm.requests[1]!.system).toContain('THE SPEC');
    // The direction pass received the script pass's YAML.
    expect(llm.requests[1]!.messages[0]!.content).toContain('[script]');
    expect(Object.keys(tools.saved)).toEqual([
      'script.mfs.yaml',
      'directed.mfs.yaml',
      'final.mfs.yaml',
    ]);
    expect(tools.synced).toHaveLength(1);
    expect(tools.rendered).toEqual([extractYaml(DIRECTED)]);
  });

  it('feeds findings back through the fix loop until clean', async () => {
    const llm = new MockLlmAdapter([SCRIPT, DIRECTED, FIXED]);
    const finding: AuthorFinding = {
      code: 'MF2002',
      severity: 'error',
      message: 'ghost target',
      hint: 'Place it first.',
    };
    const tools = fakeTools([[finding], []]);
    const result = await authorFilm(llm, tools, OPTIONS);
    expect(result.fixAttempts).toBe(1);
    expect(result.yaml).toContain('[fixed]');
    // The fix prompt carried the code, message, and hint.
    const fixPrompt = llm.requests[2]!.messages[0]!.content;
    expect(fixPrompt).toContain('MF2002');
    expect(fixPrompt).toContain('Place it first.');
    // Voice re-synced for the fixed draft too.
    expect(tools.synced).toHaveLength(2);
    expect(tools.saved['fix-1.mfs.yaml']).toContain('[fixed]');
  });

  it('gives up with the findings after the fix budget', async () => {
    const llm = new MockLlmAdapter([SCRIPT, DIRECTED, FIXED, FIXED]);
    const finding: AuthorFinding = { code: 'MF2002', severity: 'error', message: 'stuck' };
    const tools = fakeTools([[finding]]);
    await expect(authorFilm(llm, tools, { ...OPTIONS, maxFixAttempts: 1 })).rejects.toThrow(
      /still 1 finding\(s\) after 1 fix attempt/,
    );
  });

  it('the research pass outlines first and feeds the script pass', async () => {
    const llm = new MockLlmAdapter(['- fact one\n- fact two', SCRIPT, DIRECTED]);
    const tools = fakeTools([[]]);
    const result = await authorFilm(llm, tools, { ...OPTIONS, research: true });
    expect(result.researched).toBe(true);
    expect(tools.saved['outline.md']).toContain('fact one');
    expect(llm.requests[1]!.messages[0]!.content).toContain('fact two');
  });
});

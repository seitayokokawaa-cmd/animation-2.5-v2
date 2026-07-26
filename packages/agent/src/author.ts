/**
 * The author loop (M13.3, plan §5.10): topic in, screenplay out.
 *
 *   research (optional) → script pass → direction pass →
 *   voice sync → check-fix loop → render
 *
 * The loop owns orchestration only — the LLM comes in as an adapter and
 * every side effect (check, voice sync, render, saving artifacts) is an
 * injected tool, so CI drives the whole thing offline with mocks
 * (M13.6). Prompts quote the committed spec and style guide verbatim;
 * the model never invents language features.
 */

import type { LlmAdapter } from './llm.js';

export interface AuthorFinding {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
  readonly hint?: string;
}

export interface AuthorTools {
  /** `mf check` over screenplay text (with cache probe wired). */
  check(yaml: string): readonly AuthorFinding[];
  /** Freeze narration audio for the current draft. */
  voiceSync(yaml: string): Promise<void>;
  /** Render the finished film; returns the MP4 path. */
  render(yaml: string): Promise<string>;
  /** Persist an artifact (drafts, outline, transcript) for the record. */
  save(name: string, content: string): void;
}

export interface AuthorOptions {
  readonly topic: string;
  /** docs/SPEC.md contents (the CLI reads it). */
  readonly spec: string;
  /** docs/style-guide.md contents. */
  readonly styleGuide: string;
  /** Run the research outline pass first. */
  readonly research?: boolean;
  /** Fix-loop budget; default 4. */
  readonly maxFixAttempts?: number;
}

export interface AuthorResult {
  readonly yaml: string;
  readonly outPath: string;
  /** Check-fix iterations spent (0 = clean on the first try). */
  readonly fixAttempts: number;
  readonly researched: boolean;
}

/** Pull the YAML out of a model reply (fenced block wins, else whole). */
export function extractYaml(reply: string): string {
  const fence = /```(?:yaml|yml)?\n([\s\S]*?)```/.exec(reply);
  const body = fence ? fence[1]! : reply;
  return body.trim() + '\n';
}

const findingLines = (findings: readonly AuthorFinding[]): string =>
  findings
    .map((f) => `- ${f.code} (${f.severity}): ${f.message}${f.hint ? `\n  fix: ${f.hint}` : ''}`)
    .join('\n');

export async function authorFilm(
  llm: LlmAdapter,
  tools: AuthorTools,
  options: AuthorOptions,
): Promise<AuthorResult> {
  const maxFixAttempts = options.maxFixAttempts ?? 4;

  // -- research pass (optional) ---------------------------------------------
  let outline: string | undefined;
  if (options.research) {
    outline = await llm.complete({
      system:
        'You are a research assistant for a short animated explainer. ' +
        'Produce a tight factual outline: 6-10 bullets, each one concrete ' +
        'fact or event in chronological order, plus a one-line hook. ' +
        'No prose, no speculation.',
      messages: [{ role: 'user', content: `Topic: ${options.topic}` }],
    });
    tools.save('outline.md', outline);
  }

  // -- script pass: narration only ------------------------------------------
  const scriptReply = await llm.complete({
    system:
      'You write narration scripts for short animated explainers in the ' +
      'OverSimplified style. Output ONLY a partial MotionForge screenplay ' +
      'in YAML: motionforge/meta/voices and scenes with `id` and ' +
      '`narration` (voice + text) — no sync, no actions, no cast yet. ' +
      'Follow the writing rules:\n\n' +
      options.styleGuide,
    messages: [
      {
        role: 'user',
        content: outline
          ? `Topic: ${options.topic}\n\nFactual outline:\n${outline}`
          : `Topic: ${options.topic}`,
      },
    ],
  });
  const script = extractYaml(scriptReply);
  tools.save('script.mfs.yaml', script);

  // -- direction pass: attach everything else -------------------------------
  const directedReply = await llm.complete({
    system:
      'You direct MotionForge screenplays. Take the narration script and ' +
      'return the COMPLETE .mfs.yaml film: cast, stages, sync events ' +
      'anchored to phrases that appear verbatim in the narration, beat ' +
      'templates where they fit, cards, camera work, music, and sfx. ' +
      'Use only the language documented in the spec below. Return one ' +
      'fenced YAML block and nothing else.\n\n--- STYLE GUIDE ---\n' +
      options.styleGuide +
      '\n\n--- LANGUAGE SPEC ---\n' +
      options.spec,
    messages: [{ role: 'user', content: script }],
  });
  let yaml = extractYaml(directedReply);
  tools.save('directed.mfs.yaml', yaml);

  // -- voice sync + check-fix loop ------------------------------------------
  let fixAttempts = 0;
  for (;;) {
    await tools.voiceSync(yaml);
    const findings = tools.check(yaml);
    if (findings.length === 0) break;
    if (fixAttempts >= maxFixAttempts) {
      throw new Error(
        `Author loop: still ${findings.length} finding(s) after ${fixAttempts} fix attempt(s):\n${findingLines(findings)}`,
      );
    }
    fixAttempts++;
    const fixedReply = await llm.complete({
      system:
        'You fix MotionForge screenplays. Apply every hint below and ' +
        'return the COMPLETE corrected .mfs.yaml as one fenced YAML ' +
        'block. Change nothing that is not implicated by a finding.\n\n' +
        '--- LANGUAGE SPEC ---\n' +
        options.spec,
      messages: [
        { role: 'user', content: `${yaml}\n\nValidator findings:\n${findingLines(findings)}` },
      ],
    });
    yaml = extractYaml(fixedReply);
    tools.save(`fix-${fixAttempts}.mfs.yaml`, yaml);
  }

  tools.save('final.mfs.yaml', yaml);
  const outPath = await tools.render(yaml);
  return { yaml, outPath, fixAttempts, researched: options.research === true };
}

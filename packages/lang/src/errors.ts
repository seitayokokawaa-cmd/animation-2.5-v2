/**
 * MF error codes and finding printers (M2.3). Every finding is
 * machine-fixable: stable code, exact position, plain message, concrete
 * hint. Codes are permanent — never renumber (docs/errors pages hang off
 * them from M12.4).
 */

import type { SourcePos } from './loader.js';

export type Severity = 'error' | 'warning';

export interface Finding {
  readonly code: MfCode;
  readonly severity: Severity;
  readonly file: string;
  readonly pos: SourcePos;
  readonly message: string;
  readonly hint?: string;
}

/** Code registry: MF1xxx structural, MF2xxx references, MF3xxx narration. */
export const MF_CODES = {
  MF1001: 'YAML syntax error',
  MF1002: 'Schema violation',
  MF2001: 'Unknown shape reference',
  MF2002: 'Unknown action target',
  MF2003: 'Duplicate instance name',
  MF2004: 'Duplicate scene id',
  MF2005: 'Conflicting actions on one track',
  MF2006: 'Overlapping exclusive effects',
  MF2007: 'Actor targeted while offstage',
  MF2008: 'Teleport between scenes',
  MF2009: 'Line speaker not on stage',
  MF2010: 'Rider mounted on a seatless instance',
  MF3001: 'Unknown narration voice',
  MF3002: 'Anchor phrase not found',
  MF3003: 'Ambiguous anchor phrase',
  MF3004: 'Anchor occurrence out of range',
  MF3005: 'Voice cache missing or stale',
  MF3006: 'Dead air',
  MF3007: 'Sync collision',
  MF3008: 'Card overlap',
  MF3009: 'Card timing off',
  MF4001: 'Library problem',
} as const;

export type MfCode = keyof typeof MF_CODES;

export const hasErrors = (findings: readonly Finding[]): boolean =>
  findings.some((f) => f.severity === 'error');

/** Human-facing one-finding-per-block format. */
export function printPretty(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No problems found.';
  const blocks = findings.map((f) => {
    const head = `${f.severity} ${f.code} ${f.file}:${f.pos.line}:${f.pos.col} — ${f.message}`;
    return f.hint ? `${head}\n  hint: ${f.hint}` : head;
  });
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  return `${blocks.join('\n')}\n${errors} error(s), ${warnings} warning(s)`;
}

/** Stable machine format for `--json` (LLM fix loops parse this). */
export function printJson(findings: readonly Finding[]): string {
  return JSON.stringify(
    {
      findings: findings.map((f) => ({
        code: f.code,
        title: MF_CODES[f.code],
        severity: f.severity,
        file: f.file,
        line: f.pos.line,
        col: f.pos.col,
        message: f.message,
        ...(f.hint ? { hint: f.hint } : {}),
      })),
    },
    null,
    2,
  );
}

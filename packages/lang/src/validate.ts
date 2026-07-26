/**
 * Validator T1 (M2.3): syntax + structure. Parses the YAML, runs the zod
 * schema, and maps every issue to a positioned, hinted finding. If T1
 * passes, `doc` is the typed document ready for T2/compilation.
 */

import type { ZodIssue } from 'zod';

import type { Finding } from './errors.js';
import { loadYaml, type LoadedYaml, type Path } from './loader.js';
import { mfsSchema, type MfsDocument } from './schema.js';

export interface CheckResult {
  readonly findings: readonly Finding[];
  /** Present only when structural validation passed. */
  readonly doc?: MfsDocument;
  /** The positioned loader, for later tiers to reuse. */
  readonly loaded: LoadedYaml;
}

const pathToString = (path: Path): string =>
  path.length === 0 ? '(document root)' : path.map(String).join('.');

function hintFor(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `Change ${pathToString(issue.path as Path)} to a ${issue.expected}.`;
    case 'unrecognized_keys':
      return `Remove ${issue.keys.map((k) => `"${k}"`).join(', ')} — not part of MFS v0 (check for typos).`;
    case 'invalid_value':
      return `Use one of: ${issue.values.map((v) => JSON.stringify(v)).join(', ')}.`;
    case 'too_small':
      return `Provide at least ${issue.minimum} (${issue.origin}).`;
    case 'invalid_union':
      return 'Check the fields against the allowed variants (e.g. shape "kind" and its fields).';
    default:
      return 'See docs/SPEC.md for the exact shape of this field.';
  }
}

export function checkStructure(text: string, file: string): CheckResult {
  const loaded = loadYaml(text);

  if (loaded.issues.length > 0) {
    return {
      loaded,
      findings: loaded.issues.map((issue) => ({
        code: 'MF1001' as const,
        severity: 'error' as const,
        file,
        pos: issue.pos,
        message: issue.message,
        hint: 'Fix the YAML syntax; the document could not be parsed at all.',
      })),
    };
  }

  const parsed = mfsSchema.safeParse(loaded.value);
  if (!parsed.success) {
    const findings = parsed.error.issues.map((issue) => ({
      code: 'MF1002' as const,
      severity: 'error' as const,
      file,
      pos: loaded.locate(issue.path as Path),
      message: `${pathToString(issue.path as Path)}: ${issue.message}`,
      hint: hintFor(issue),
    }));
    return { loaded, findings };
  }

  return { loaded, findings: [], doc: parsed.data };
}

/**
 * Object library loader (M5.4). Films pull object collections in via
 * `use:`; paths starting with `library/` resolve against the built-in
 * assets directory, everything else against the film's own directory.
 * Library files are YAML documents with a single `objects:` block.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { z } from 'zod';

import type { Finding } from './errors.js';
import { loadYaml } from './loader.js';
import { objectDefSchema, type MfsObjectDef } from './parts.js';

const librarySchema = z
  .object({
    objects: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), objectDefSchema),
  })
  .strict();

export interface LibraryOptions {
  /** Directory of the film file (for project-relative paths). */
  readonly filmDir: string;
  /** Root that `library/…` paths resolve against (assets dir). */
  readonly builtinDir: string;
}

export interface LoadedLibraries {
  readonly objects: Readonly<Record<string, MfsObjectDef>>;
  readonly findings: readonly Finding[];
}

export function resolveLibraryPath(use: string, options: LibraryOptions): string {
  if (isAbsolute(use)) return use;
  if (use.startsWith('library/')) return join(options.builtinDir, use.slice('library/'.length));
  return join(options.filmDir, use);
}

/** Load and merge `use:` libraries. Later files may not redefine names. */
export function loadLibraries(uses: readonly string[], options: LibraryOptions): LoadedLibraries {
  const objects: Record<string, MfsObjectDef> = {};
  const owner: Record<string, string> = {};
  const findings: Finding[] = [];
  const finding = (message: string, hint: string): Finding => ({
    code: 'MF4001',
    severity: 'error',
    file: 'use:',
    pos: { line: 1, col: 1 },
    message,
    hint,
  });

  for (const use of uses) {
    const path = resolveLibraryPath(use, options);
    if (!existsSync(path)) {
      findings.push(
        finding(
          `Library ${JSON.stringify(use)} not found (looked at ${path})`,
          'Built-in libraries live under library/…; other paths are relative to the film file.',
        ),
      );
      continue;
    }
    const loaded = loadYaml(readFileSync(path, 'utf8'));
    if (loaded.issues.length > 0 || loaded.value === undefined) {
      findings.push(
        finding(`Library ${JSON.stringify(use)} is not valid YAML`, `Fix the syntax in ${path}.`),
      );
      continue;
    }
    const parsed = librarySchema.safeParse(loaded.value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      findings.push(
        finding(
          `Library ${JSON.stringify(use)} is invalid: ${issue?.path.join('.')}: ${issue?.message}`,
          `Library files contain a single objects: block of part-trees (see docs/SPEC.md).`,
        ),
      );
      continue;
    }
    for (const [name, def] of Object.entries(parsed.data.objects)) {
      if (owner[name] !== undefined) {
        findings.push(
          finding(
            `Object "${name}" is defined by both ${JSON.stringify(owner[name])} and ${JSON.stringify(use)}`,
            'Rename one of them; library object names must be unique.',
          ),
        );
        continue;
      }
      owner[name] = use;
      objects[name] = def;
    }
  }

  return { objects, findings };
}

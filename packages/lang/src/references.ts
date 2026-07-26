/**
 * Validator T2 (M2.4): reference integrity with did-you-mean suggestions.
 * Runs only on structurally valid documents (T1 passed).
 */

import type { Finding } from './errors.js';
import type { LoadedYaml } from './loader.js';
import { checkNarration, type NarrationCacheProbe } from './narration-validate.js';
import type { MfsDocument } from './schema.js';
import { checkStructure, type CheckResult } from './validate.js';

/** Levenshtein distance, iterative two-row version. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Closest candidate within an edit-distance budget, or undefined. */
export function didYouMean(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDist = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const candidate of candidates) {
    const d = editDistance(name, candidate);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

const suggest = (name: string, candidates: Iterable<string>): string => {
  const hit = didYouMean(name, candidates);
  return hit ? ` Did you mean "${hit}"?` : '';
};

export function checkReferences(doc: MfsDocument, loaded: LoadedYaml, file: string): Finding[] {
  const findings: Finding[] = [];
  const shapeNames = [...Object.keys(doc.shapes), ...Object.keys(doc.objects)];
  const sceneIds = new Set<string>();

  doc.scenes.forEach((scene, si) => {
    if (sceneIds.has(scene.id)) {
      findings.push({
        code: 'MF2004',
        severity: 'error',
        file,
        pos: loaded.locate(['scenes', si, 'id']),
        message: `Duplicate scene id "${scene.id}"`,
        hint: 'Give every scene a unique id.',
      });
    }
    sceneIds.add(scene.id);

    const placed = new Set<string>();
    scene.place.forEach((place, pi) => {
      if (!shapeNames.includes(place.ref)) {
        findings.push({
          code: 'MF2001',
          severity: 'error',
          file,
          pos: loaded.locate(['scenes', si, 'place', pi, 'ref']),
          message: `Scene "${scene.id}" places unknown shape/object "${place.ref}"`,
          hint: `Define it under shapes: or objects: — or fix the name.${suggest(place.ref, shapeNames)}`,
        });
      }
      if (placed.has(place.as)) {
        findings.push({
          code: 'MF2003',
          severity: 'error',
          file,
          pos: loaded.locate(['scenes', si, 'place', pi, 'as']),
          message: `Scene "${scene.id}" places two instances named "${place.as}"`,
          hint: 'Give every placement a unique "as" name within its scene.',
        });
      }
      placed.add(place.as);
    });

    scene.actions.forEach((action, ai) => {
      const verb = action.move ?? action.rotate ?? action.scale;
      const verbName = action.move ? 'move' : action.rotate ? 'rotate' : 'scale';
      if (verb && !placed.has(verb.target)) {
        findings.push({
          code: 'MF2002',
          severity: 'error',
          file,
          pos: loaded.locate(['scenes', si, 'actions', ai, verbName, 'target']),
          message: `Scene "${scene.id}" ${verbName} targets "${verb.target}", which is not placed in this scene`,
          hint: `Place it first or fix the name.${suggest(verb.target, placed)}`,
        });
      }
    });
  });

  return findings;
}

export interface CheckOptions {
  /** Freeze-cache probe (from the CLI); enables stale-cache findings. */
  readonly cacheProbe?: NarrationCacheProbe;
}

/** T1 + T2 + narration checks — the `mf check` entry point. */
export function check(text: string, file: string, options: CheckOptions = {}): CheckResult {
  const t1 = checkStructure(text, file);
  if (!t1.doc) return t1;
  const findings = [
    ...t1.findings,
    ...checkReferences(t1.doc, t1.loaded, file),
    ...checkNarration(t1.doc, t1.loaded, file, options.cacheProbe),
  ];
  return { ...t1, findings };
}

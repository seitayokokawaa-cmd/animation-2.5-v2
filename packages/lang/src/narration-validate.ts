/**
 * Narration validation (M3.7): unknown voices, unresolvable/ambiguous
 * anchors, out-of-range occurrences, and stale/missing voice-cache entries
 * — every finding with a concrete fix hint.
 */

import { tokenizeWords } from '@motionforge/core';

import type { Finding } from './errors.js';
import type { LoadedYaml } from './loader.js';
import { findPhrase, type MfsAnchor } from './narration.js';
import { editDistance } from './references.js';
import type { MfsDocument } from './schema.js';

/**
 * Freeze-cache probe, implemented by the CLI over the lock + cache dir.
 * `ok`: frozen and current · `stale`: text/voice changed since sync ·
 * `missing`: never synced.
 */
export type CacheState = 'ok' | 'stale' | 'missing';

export interface NarrationCacheProbe {
  readonly probe: (
    key: string,
    spec: { engine: string; voice: string; rate?: number; pitch?: number },
    text: string,
  ) => CacheState;
}

const phraseOf = (anchor: MfsAnchor): string =>
  typeof anchor === 'string' ? anchor : anchor.phrase;

/** Closest same-length word window in the segment, for did-you-mean hints. */
function nearestWindow(words: readonly string[], phrase: string): string | undefined {
  const needle = tokenizeWords(phrase);
  if (needle.length === 0 || needle.length > words.length) return undefined;
  const target = needle.join(' ').toLowerCase();
  let best: string | undefined;
  let bestDist = Math.max(3, Math.floor(target.length / 3)) + 1;
  for (let i = 0; i + needle.length <= words.length; i++) {
    const window = words.slice(i, i + needle.length).join(' ');
    const d = editDistance(window.toLowerCase(), target);
    if (d < bestDist) {
      bestDist = d;
      best = window;
    }
  }
  return best;
}

export function checkNarration(
  doc: MfsDocument,
  loaded: LoadedYaml,
  file: string,
  cacheProbe?: NarrationCacheProbe,
): Finding[] {
  const findings: Finding[] = [];

  doc.scenes.forEach((scene, si) => {
    scene.narration.forEach((segment, ni) => {
      const basePath = ['scenes', si, 'narration', ni] as const;
      const spec = doc.voices[segment.voice];

      if (!spec) {
        const candidates = Object.keys(doc.voices);
        findings.push({
          code: 'MF3001',
          severity: 'error',
          file,
          pos: loaded.locate([...basePath, 'voice']),
          message: `Scene "${scene.id}" narration uses unknown voice "${segment.voice}"`,
          hint:
            candidates.length > 0
              ? `Declare it under voices: or use one of: ${candidates.join(', ')}.`
              : 'Declare it under voices: at the top of the film.',
        });
      }

      const words = tokenizeWords(segment.text);
      segment.sync.forEach((sync, yi) => {
        const phrase = phraseOf(sync.on);
        const hits = findPhrase(words, phrase);
        const pos = loaded.locate([...basePath, 'sync', yi, 'on']);
        if (hits.length === 0) {
          const suggestion = nearestWindow(words, phrase);
          findings.push({
            code: 'MF3002',
            severity: 'error',
            file,
            pos,
            message: `Anchor phrase ${JSON.stringify(phrase)} does not occur in the narration text`,
            hint: suggestion
              ? `Did you mean ${JSON.stringify(suggestion)}? Anchors must quote the narration verbatim.`
              : 'Anchors must quote the narration text verbatim (punctuation ignored, case-insensitive).',
          });
        } else if (typeof sync.on === 'string' && hits.length > 1) {
          findings.push({
            code: 'MF3003',
            severity: 'warning',
            file,
            pos,
            message: `Anchor phrase ${JSON.stringify(phrase)} occurs ${hits.length}× — binding to the first`,
            hint: `Disambiguate with { phrase: ${JSON.stringify(phrase)}, nth: 2 } (…${hits.length}) if you meant a later one.`,
          });
        } else if (typeof sync.on !== 'string' && sync.on.nth > hits.length) {
          findings.push({
            code: 'MF3004',
            severity: 'error',
            file,
            pos,
            message: `Anchor asks for occurrence ${sync.on.nth} of ${JSON.stringify(phrase)}, but it occurs ${hits.length}×`,
            hint: `Use nth between 1 and ${hits.length}.`,
          });
        }
      });

      if (spec && cacheProbe) {
        const state = cacheProbe.probe(`${scene.id}/${ni}`, spec, segment.text);
        if (state !== 'ok') {
          findings.push({
            code: 'MF3005',
            severity: 'error',
            file,
            pos: loaded.locate([...basePath, 'text']),
            message:
              state === 'missing'
                ? `Narration segment ${scene.id}/${ni} has never been synthesized`
                : `Narration segment ${scene.id}/${ni} changed since it was synthesized (stale cache)`,
            hint: `Run \`mf voice sync ${file}\` (the only networked command) and commit the updated cache + lock.`,
          });
        }
      }
    });
  });

  return findings;
}

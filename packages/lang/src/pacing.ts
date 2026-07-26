/**
 * Validator T3 (M12.3): pacing lints — the genre's "something happens
 * every 2–5 seconds" rule (plan §3) as warnings:
 *
 * - **Dead air**: >5 s of an explicitly-timed scene with no beat. Scenes
 *   whose timing comes from narration alignment are skipped here — their
 *   sync events land with the words by construction.
 * - **Sync collisions**: two attention-grabbing events (cards, cutaways,
 *   explosions) within 0.3 s of each other — they fight for the eye.
 * - **Card overlaps**: two cards on screen at once in the same spot.
 * - **Card timing**: cards too short to read (~15 chars/s + a beat) or
 *   parked on screen past 8 s.
 */

import type { Finding } from './errors.js';
import type { LoadedYaml, SourcePos } from './loader.js';
import type { MfsDocument } from './schema.js';

const DEAD_AIR_SECONDS = 5;
const COLLISION_WINDOW_SECONDS = 0.3;
const CARD_MAX_SECONDS = 8;
const READ_CHARS_PER_SECOND = 15;

/** Verbs that grab the whole frame's attention. */
const ATTENTION_VERBS = ['card', 'cutaway', 'explode'] as const;

interface CardEvent {
  readonly at: number;
  readonly duration: number;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly actionIndex: number;
}

export function checkPacing(doc: MfsDocument, loaded: LoadedYaml, file: string): Finding[] {
  const findings: Finding[] = [];

  doc.scenes.forEach((scene, si) => {
    const hasSync = scene.narration.some((segment) => segment.sync.length > 0);

    // -- dead air (explicit-duration scenes only) ---------------------------
    if (scene.duration !== undefined && !hasSync && scene.lines.length === 0) {
      const beats = scene.actions.map((a) => a.at).sort((a, b) => a - b);
      const gaps: Array<[number, number]> = [];
      let cursor = 0;
      for (const beat of beats) {
        if (beat - cursor > DEAD_AIR_SECONDS) gaps.push([cursor, beat]);
        cursor = Math.max(cursor, beat);
      }
      if (beats.length === 0 && scene.duration > DEAD_AIR_SECONDS) {
        gaps.push([0, scene.duration]);
      }
      for (const [from, to] of gaps) {
        findings.push({
          code: 'MF3006',
          severity: 'warning',
          file,
          pos: loaded.locate(['scenes', si, 'id']),
          message: `Scene "${scene.id}": nothing happens between ${from}s and ${to}s (${(to - from).toFixed(1)}s of dead air)`,
          hint: 'Add a beat every 2–5 s — a pop, card, camera move, or gag — or shorten the scene.',
        });
      }
    }

    // -- sync collisions ----------------------------------------------------
    interface Attention {
      readonly label: string;
      readonly seconds: number;
      readonly pos: SourcePos;
    }
    /** Groups whose members share a known time base: absolute `at:`
     * actions in one group; each (segment, anchor phrase, nth) in its own
     * — different anchors have unknown spacing pre-alignment. */
    const groups = new Map<string, Attention[]>();
    const push = (key: string, entry: Attention): void => {
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(entry);
    };
    scene.actions.forEach((action, ai) => {
      for (const verb of ATTENTION_VERBS) {
        if ((action as Record<string, unknown>)[verb]) {
          push('at', {
            label: verb,
            seconds: action.at,
            pos: loaded.locate(['scenes', si, 'actions', ai]),
          });
        }
      }
    });
    scene.narration.forEach((segment, ni) => {
      segment.sync.forEach((sync, yi) => {
        const doList = Array.isArray(sync.do) ? sync.do : [sync.do];
        for (const verb of ATTENTION_VERBS) {
          if (doList.some((d) => (d as Record<string, unknown>)[verb])) {
            const phrase = typeof sync.on === 'string' ? sync.on : sync.on.phrase;
            const nth = typeof sync.on === 'string' ? 1 : sync.on.nth;
            push(`${ni}/${phrase}/${nth}`, {
              label: `${verb} on "${phrase}"`,
              seconds: sync.offset ?? 0,
              pos: loaded.locate(['scenes', si, 'narration', ni, 'sync', yi]),
            });
          }
        }
      });
    });
    for (const attention of groups.values()) {
      attention.sort((a, b) => a.seconds - b.seconds);
      for (let i = 1; i < attention.length; i++) {
        const prev = attention[i - 1]!;
        const cur = attention[i]!;
        if (cur.seconds - prev.seconds >= COLLISION_WINDOW_SECONDS) continue;
        findings.push({
          code: 'MF3007',
          severity: 'warning',
          file,
          pos: cur.pos,
          message: `Scene "${scene.id}": ${cur.label} lands within ${COLLISION_WINDOW_SECONDS}s of ${prev.label} — they fight for attention`,
          hint: 'Stagger the two beats by at least 0.3 s (offset: on the sync, or a later at:).',
        });
      }
    }

    // -- card overlaps + card timing ---------------------------------------
    const cards: CardEvent[] = [];
    scene.actions.forEach((action, ai) => {
      const c = action.card;
      if (!c) return;
      const text = c.text ?? (c.items ?? []).join(' ');
      cards.push({
        at: action.at,
        duration: c.duration,
        x: c.at?.[0] ?? 0,
        y: c.at?.[1] ?? 0,
        text,
        actionIndex: ai,
      });
      const minSeconds = Math.min(6, 0.8 + text.length / READ_CHARS_PER_SECOND);
      if (c.duration < minSeconds) {
        findings.push({
          code: 'MF3009',
          severity: 'warning',
          file,
          pos: loaded.locate(['scenes', si, 'actions', ai, 'card', 'duration']),
          message: `Scene "${scene.id}": card "${text.slice(0, 32)}" shows for ${c.duration}s — too short to read (${text.length} chars wants ≥ ${minSeconds.toFixed(1)}s)`,
          hint: 'Lengthen the card or trim its text.',
        });
      }
      if (c.duration > CARD_MAX_SECONDS) {
        findings.push({
          code: 'MF3009',
          severity: 'warning',
          file,
          pos: loaded.locate(['scenes', si, 'actions', ai, 'card', 'duration']),
          message: `Scene "${scene.id}": card "${text.slice(0, 32)}" parks on screen for ${c.duration}s`,
          hint: `Keep cards under ${CARD_MAX_SECONDS}s — split it or cut it away.`,
        });
      }
    });
    cards.sort((a, b) => a.at - b.at);
    for (let i = 1; i < cards.length; i++) {
      const prev = cards[i - 1]!;
      const cur = cards[i]!;
      if (cur.at >= prev.at + prev.duration) continue;
      if (Math.hypot(cur.x - prev.x, cur.y - prev.y) >= 2.5) continue;
      findings.push({
        code: 'MF3008',
        severity: 'warning',
        file,
        pos: loaded.locate(['scenes', si, 'actions', cur.actionIndex]),
        message: `Scene "${scene.id}": card at ${cur.at}s overlaps the card from ${prev.at}s in the same spot (visible until ${prev.at + prev.duration}s)`,
        hint: 'Delay the second card, or give it its own at: position.',
      });
    }
  });

  return findings;
}

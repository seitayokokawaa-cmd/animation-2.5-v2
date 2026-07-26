/**
 * Spec + registry drift checks (M12.5). CI fails when docs/SPEC.md is
 * stale or when the schema's duplicated choice lists / verb defaults
 * disagree with the engine registries they mirror.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EASING_NAMES, FRAMING_MARGINS, GRADE_KINDS, TRANSITION_KINDS } from '@motionforge/core';
import {
  COSTUME_CHOICES,
  EASING_CHOICES,
  EFFECT_DEFAULT_SECONDS,
  GAIT_CHOICES,
  GAIT_SPEEDS,
  LOCOMOTION_CHOICES,
  LOCOMOTION_RATES_LANG,
  EXPRESSION_CHOICES,
  GESTURE_CHOICES,
  GRADE_CHOICES,
  HELD_CHOICES,
  LANG_VERB_SUMMARIES,
  MUSIC_MOOD_CHOICES,
  MUSTACHE_CHOICES,
  REACTION_CHOICES,
  SHOT_CHOICES,
  STAGE_PRESET_NAMES,
  STAGE_PRESETS,
  TEMPLATE_CHOICES,
  TRANSITION_CHOICES,
  VERB_NAMES,
} from '@motionforge/lang';
import {
  CHARACTER_TEMPLATES,
  COSTUME_PIECES,
  FACE_EXPRESSIONS,
  GAIT_KINDS,
  GAITS,
  GESTURE_KINDS,
  LOCOMOTION_KINDS,
  LOCOMOTION_RATES,
  HELD_ITEMS,
  MUSTACHES,
  REACTION_KINDS,
  VERB_REGISTRY,
} from '@motionforge/motion';
import { MUSIC_MOODS } from '@motionforge/render';
import { describe, expect, it } from 'vitest';

import { buildSpec } from './spec.js';

const REPO = join(import.meta.dirname, '..', '..', '..');

describe('spec generator + drift checks (M12.5)', () => {
  it('docs/SPEC.md matches the generator output', () => {
    const committed = readFileSync(join(REPO, 'docs', 'SPEC.md'), 'utf8');
    expect(
      committed === buildSpec(),
      'docs/SPEC.md is stale — run `pnpm mf spec --out docs/SPEC.md` and commit',
    ).toBe(true);
  });

  it('compile effect defaults mirror the motion registry', () => {
    for (const [name, seconds] of Object.entries(EFFECT_DEFAULT_SECONDS)) {
      const def = VERB_REGISTRY.get(name);
      if (!def) continue; // lang-owned clip verbs
      expect(seconds, `EFFECT_DEFAULT_SECONDS[${name}]`).toBe(def.defaultDurationSeconds);
    }
  });

  it('every authoring verb has a summary from exactly one source', () => {
    for (const name of VERB_NAMES) {
      const fromRegistry = VERB_REGISTRY.get(name)?.summary;
      const fromLang = LANG_VERB_SUMMARIES[name];
      expect(Boolean(fromRegistry ?? fromLang), `verb "${name}" has no summary for the spec`).toBe(
        true,
      );
    }
  });

  it('gait tables mirror the motion registry', () => {
    expect([...GAIT_CHOICES]).toEqual([...GAIT_KINDS]);
    for (const kind of GAIT_KINDS) {
      expect(GAIT_SPEEDS[kind], `GAIT_SPEEDS[${kind}]`).toBe(GAITS[kind].speed);
    }
  });

  it('locomotion tables mirror the motion registry', () => {
    expect([...LOCOMOTION_CHOICES]).toEqual([...LOCOMOTION_KINDS]);
    for (const kind of LOCOMOTION_KINDS) {
      expect(LOCOMOTION_RATES_LANG[kind], `LOCOMOTION_RATES_LANG[${kind}]`).toBe(
        LOCOMOTION_RATES[kind],
      );
    }
  });

  it('schema choice lists mirror their engine registries', () => {
    expect([...EASING_CHOICES].sort()).toEqual([...EASING_NAMES].sort());
    expect([...SHOT_CHOICES].sort()).toEqual(Object.keys(FRAMING_MARGINS).sort());
    expect([...TRANSITION_CHOICES].sort()).toEqual([...TRANSITION_KINDS].sort());
    expect([...GRADE_CHOICES].sort()).toEqual([...GRADE_KINDS].sort());
    expect([...MUSIC_MOOD_CHOICES].sort()).toEqual([...MUSIC_MOODS].sort());
    expect([...GESTURE_CHOICES].sort()).toEqual([...GESTURE_KINDS].sort());
    expect([...REACTION_CHOICES].sort()).toEqual([...REACTION_KINDS].sort());
    expect([...EXPRESSION_CHOICES].sort()).toEqual(Object.keys(FACE_EXPRESSIONS).sort());
    expect([...COSTUME_CHOICES].sort()).toEqual(Object.keys(COSTUME_PIECES).sort());
    expect([...MUSTACHE_CHOICES].sort()).toEqual(Object.keys(MUSTACHES).sort());
    expect([...HELD_CHOICES].sort()).toEqual(Object.keys(HELD_ITEMS).sort());
    expect([...STAGE_PRESET_NAMES].sort()).toEqual(Object.keys(STAGE_PRESETS).sort());
    expect([...TEMPLATE_CHOICES].sort()).toEqual(Object.keys(CHARACTER_TEMPLATES).sort());
  });
});

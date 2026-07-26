/**
 * Multi-script goldens (M11.3): one locked frame per script family —
 * Bengali conjuncts, Arabic joining (RTL + bidi with an embedded Latin
 * word), CJK, and a mixed-direction line through the M11.1 fallback
 * chain. Goldens update only via `pnpm goldens:update` + eyeballing.
 */
import { join } from 'node:path';

import { matchGolden } from '@motionforge/core';
import { compile, mfsSchema } from '@motionforge/lang';
import { describe, expect, it } from 'vitest';

import { buildFrameSvg } from './frame.js';

const GOLDEN_DIR = join(import.meta.dirname, '__goldens__');

const filmWith = (
  font: string,
  caption: string,
  card: string,
  extraCaption?: string,
): ReturnType<typeof compile> =>
  compile(
    mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'i18n', resolution: '640x360', fps: 30, seed: 9, style: 'explainer-paper' },
      scenes: [
        {
          id: 's',
          duration: 4,
          actions: [
            { at: 0.2, caption: { text: caption, duration: 3, at: [0, 0.6], font } },
            ...(extraCaption
              ? [{ at: 0.2, caption: { text: extraCaption, duration: 3, at: [0, -1], font } }]
              : []),
            {
              at: 0.3,
              card: { style: 'label', text: card, duration: 3, at: [0, 2.4], font },
            },
          ],
        },
      ],
    }),
  );

const CASES: Record<string, ReturnType<typeof compile>> = {
  bengali: filmWith('noto-bengali', 'ঢাকা শহরের যুদ্ধক্ষেত্র', 'বাংলা'),
  // Arabic joins RTL; the second caption embeds a Latin word mid-sentence
  // (single-level bidi through the fallback chain).
  arabic: filmWith('noto-arabic', 'السلام عليكم ورحمة الله', 'حرب', 'قال Hello ثم غادر'),
  cjk: filmWith('noto-sc', '世界大战的历史', '战争'),
  // All four scripts in one line via the noto-sans chain.
  mixed: filmWith('noto-sans', 'War যুদ্ধ حرب 战争', 'MotionForge'),
};

describe('multi-script goldens (M11.3)', () => {
  for (const [name, film] of Object.entries(CASES)) {
    it(`golden frame: ${name}`, () => {
      const svg = buildFrameSvg(film, 240);
      const result = matchGolden(join(GOLDEN_DIR, `i18n-${name}.svg`), svg);
      expect(result.ok, result.message).toBe(true);
    });
  }

  it('multi-script frames are byte-deterministic', () => {
    expect(buildFrameSvg(CASES.mixed!, 240)).toBe(buildFrameSvg(CASES.mixed!, 240));
  });
});

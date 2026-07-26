/**
 * Style presets (M4.6): one golden frame per preset locks the look
 * (plan §8). Goldens update only via `pnpm goldens:update` + eyeballing.
 */
import { join } from 'node:path';

import { matchGolden } from '@motionforge/core';
import { compile, mfsSchema } from '@motionforge/lang';
import { describe, expect, it } from 'vitest';

import { buildFrameSvg } from './frame.js';
import { stylePreset, STYLE_PRESETS } from './style.js';

const GOLDEN_DIR = join(import.meta.dirname, '__goldens__');

const filmWithStyle = (style: string) =>
  compile(
    mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'Style', resolution: '640x360', fps: 30, seed: 4, style },
      shapes: {
        box: { kind: 'rect', width: 2, height: 1.2, rx: 0.15, fill: '#d94f30' },
      },
      scenes: [
        {
          id: 's',
          duration: 4,
          place: [{ ref: 'box', as: 'b', at: [-2, -1] }],
          actions: [
            { at: 0.2, card: { style: 'date', text: '1914', duration: 3, at: [2, 1.4] } },
            { at: 0.3, caption: { text: 'style locked', duration: 3 } },
            { at: 0.5, pulse: { target: 'b' } },
          ],
        },
      ],
    }),
  );

describe('style presets (M4.6)', () => {
  it('registers both shipped presets and rejects unknown names', () => {
    expect(Object.keys(STYLE_PRESETS).sort()).toEqual(['clean-flat', 'explainer-paper']);
    expect(stylePreset(undefined).name).toBe('clean-flat');
    expect(() => stylePreset('vaporwave')).toThrow(/Unknown style preset/);
  });

  for (const style of Object.keys(STYLE_PRESETS)) {
    it(`golden frame: ${style}`, () => {
      const svg = buildFrameSvg(filmWithStyle(style), 240);
      const result = matchGolden(join(GOLDEN_DIR, `style-${style}.svg`), svg);
      expect(result.ok, result.message).toBe(true);
    });
  }

  it('presets differ visibly (background + card theme)', () => {
    const paper = buildFrameSvg(filmWithStyle('explainer-paper'), 240);
    const flat = buildFrameSvg(filmWithStyle('clean-flat'), 240);
    expect(paper).not.toBe(flat);
    expect(paper).toContain('#e9dfc9'); // paper background
    expect(flat).toContain('#22262e'); // flat background
  });
});

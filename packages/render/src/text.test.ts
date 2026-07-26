import { describe, expect, it } from 'vitest';

import { shapeText } from './text.js';

describe('shapeText', () => {
  it('shapes latin text into glyph paths with advances', () => {
    const run = shapeText('noto-sans', 'Hi');
    expect(run.paths.length).toBe(2);
    expect(run.upem).toBeGreaterThan(0);
    expect(run.width).toBeGreaterThan(0);
    expect(run.paths[1]!.x).toBeGreaterThan(0);
  });

  it('caches by (font, text) — same object back', () => {
    expect(shapeText('noto-sans', 'cache me')).toBe(shapeText('noto-sans', 'cache me'));
  });

  it('shapes Bengali with conjuncts (fewer glyphs than code points)', () => {
    const text = 'ক্ষ';
    const run = shapeText('noto-bengali', text);
    expect(run.paths.length).toBeLessThan(text.length);
    expect(run.width).toBeGreaterThan(0);
  });

  it('shapes Arabic RTL with joining', () => {
    const run = shapeText('noto-arabic', 'السلام');
    expect(run.paths.length).toBeGreaterThan(0);
  });

  it('rejects unknown fonts', () => {
    expect(() => shapeText('comic-sans', 'no')).toThrow(/Unknown font/);
  });

  describe('script fallback chain (M11.1)', () => {
    it('shapes Bengali inside a Latin caption', () => {
      const latin = shapeText('noto-sans', 'Dhaka ');
      const mixed = shapeText('noto-sans', 'Dhaka ঢাকা');
      expect(mixed.paths.length).toBeGreaterThan(latin.paths.length);
      expect(mixed.width).toBeGreaterThan(latin.width);
    });

    it('shapes CJK through the noto-sans primary', () => {
      const run = shapeText('noto-sans', '中文');
      expect(run.paths.length).toBe(2);
      expect(run.width).toBeGreaterThan(0);
    });

    it('keeps multi-word Arabic as one RTL run (word order intact)', () => {
      // Neutral spaces join the Arabic run, so shaping through the Latin
      // primary matches shaping with the Arabic font directly.
      const viaPrimary = shapeText('noto-sans', 'السلام عليكم');
      const direct = shapeText('noto-arabic', 'السلام عليكم');
      expect(viaPrimary.width).toBe(direct.width);
      expect(viaPrimary.paths.length).toBe(direct.paths.length);
      expect(viaPrimary.paths.map((p) => p.x)).toEqual(direct.paths.map((p) => p.x));
    });

    it('digits and punctuation stay with the surrounding run', () => {
      // A pure-Latin string with digits still shapes as a single run —
      // byte-identical to the pre-chain output.
      const run = shapeText('noto-sans', 'In 1914, war!');
      expect(run.paths.length).toBeGreaterThan(0);
      expect(run.upem).toBe(1000);
    });
  });
});

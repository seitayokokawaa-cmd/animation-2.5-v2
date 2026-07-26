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
});

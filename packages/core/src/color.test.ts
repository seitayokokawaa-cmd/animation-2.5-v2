import { describe, expect, it } from 'vitest';

import { formatColor, lerpColor, parseColor, rgba, withAlpha } from './color.js';

describe('color', () => {
  it('parses hex forms', () => {
    expect(parseColor('#fff')).toEqual(rgba(255, 255, 255, 1));
    expect(parseColor('#d94f30')).toEqual(rgba(217, 79, 48, 1));
    expect(parseColor('#d94f3080').a).toBeCloseTo(128 / 255, 6);
    expect(parseColor('#f00c')).toEqual(rgba(255, 0, 0, 204 / 255));
  });

  it('rejects junk', () => {
    for (const bad of ['red', '#12345', '#gggggg', 'd94f30', '']) {
      expect(() => parseColor(bad)).toThrow(/Invalid color/);
    }
  });

  it('formats canonically (lowercase, alpha only when < 1)', () => {
    expect(formatColor(parseColor('#D94F30'))).toBe('#d94f30');
    expect(formatColor(rgba(255, 0, 0, 0.5))).toBe('#ff000080');
    expect(formatColor(rgba(1, 2, 3))).toBe('#010203');
  });

  it('round-trips parse → format', () => {
    for (const hex of ['#000000', '#ffffff', '#3c6fb5', '#b5453c80']) {
      expect(formatColor(parseColor(hex))).toBe(hex);
    }
  });

  it('lerps channels and alpha', () => {
    const mid = lerpColor(rgba(0, 0, 0, 0), rgba(255, 100, 50, 1), 0.5);
    expect(mid).toEqual(rgba(128, 50, 25, 0.5));
  });

  it('clamps channel inputs', () => {
    expect(rgba(300, -5, 12.4)).toEqual(rgba(255, 0, 12));
    expect(withAlpha(rgba(1, 2, 3), 2).a).toBe(1);
  });
});

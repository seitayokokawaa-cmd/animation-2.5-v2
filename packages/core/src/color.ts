/**
 * Color: sRGB with 0–255 integer channels and 0–1 alpha. Formatting is
 * canonical (lowercase hex) so emitted SVG is byte-stable.
 */

import { clamp } from './math.js';

export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1; 1 = opaque. */
  readonly a: number;
}

export const rgba = (r: number, g: number, b: number, a = 1): Color => ({
  r: clamp(Math.round(r), 0, 255),
  g: clamp(Math.round(g), 0, 255),
  b: clamp(Math.round(b), 0, 255),
  a: clamp(a, 0, 1),
});

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Parse `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa`. */
export function parseColor(hex: string): Color {
  if (!HEX_RE.test(hex)) throw new Error(`Invalid color: ${JSON.stringify(hex)}`);
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map((ch) => ch + ch).join('');
  const int = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return rgba(int(0), int(2), int(4), h.length === 8 ? int(6) / 255 : 1);
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

/** Canonical form: `#rrggbb`, or `#rrggbbaa` only when alpha < 1. */
export function formatColor(c: Color): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a >= 1 ? base : `${base}${hex2(Math.round(c.a * 255))}`;
}

/** Linear interpolation per sRGB channel — cartoon-correct and cheap. */
export const lerpColor = (a: Color, b: Color, t: number): Color =>
  rgba(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);

export const withAlpha = (c: Color, a: number): Color => rgba(c.r, c.g, c.b, a);

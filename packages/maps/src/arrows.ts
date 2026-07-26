/**
 * Offensive arrows (M7.4, plan §5.2): fat curved arrows that grow from
 * origin to target — the genre's invasion shorthand. Pure geometry: the
 * caller drives t ∈ [0,1] and gets a single filled polygon (ribbon + head)
 * in map-local units.
 */

import { clamp, vec2, type Vec2 } from '@motionforge/core';

export interface ArrowOptions {
  /** Body width in world units. */
  readonly width?: number;
  /** Sideways bow as a fraction of the length; sign picks the side. */
  readonly bow?: number;
}

/** Quadratic bezier point for the arrow's spine. */
export function arrowSpine(from: Vec2, to: Vec2, bow: number, s: number): Vec2 {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx = mx - dy * bow;
  const cy = my + dx * bow;
  const u = 1 - s;
  return vec2(
    u * u * from.x + 2 * u * s * cx + s * s * to.x,
    u * u * from.y + 2 * u * s * cy + s * s * to.y,
  );
}

const spineTangent = (from: Vec2, to: Vec2, bow: number, s: number): Vec2 => {
  const a = arrowSpine(from, to, bow, Math.max(0, s - 0.01));
  const b = arrowSpine(from, to, bow, Math.min(1, s + 0.01));
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9;
  return vec2((b.x - a.x) / len, (b.y - a.y) / len);
};

/**
 * The arrow polygon at growth t. Empty below t ≈ 0. At t = 1 with bow 0
 * the apex sits exactly on `to`.
 */
export function arrowPolygon(from: Vec2, to: Vec2, t: number, options: ArrowOptions = {}): Vec2[] {
  const grow = clamp(t, 0, 1);
  if (grow < 0.02) return [];
  const width = options.width ?? 0.32;
  const bow = options.bow ?? 0.18;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 1e-6) return [];

  // The head occupies the front of the grown span.
  const headSpan = clamp((2.4 * width) / length, 0.1, 0.55) * Math.min(1, grow * 3);
  const tip = grow;
  const neck = Math.max(0, grow - headSpan);

  const SAMPLES = 14;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const s = (i / SAMPLES) * neck;
    const p = arrowSpine(from, to, bow, s);
    const tangent = spineTangent(from, to, bow, s);
    const nx = -tangent.y;
    const ny = tangent.x;
    // Slight taper toward the tail keeps it hand-drawn.
    const w = (width / 2) * (0.82 + 0.18 * (s / Math.max(neck, 1e-6)));
    left.push(vec2(p.x + nx * w, p.y + ny * w));
    right.push(vec2(p.x - nx * w, p.y - ny * w));
  }

  const neckPoint = arrowSpine(from, to, bow, neck);
  const neckTangent = spineTangent(from, to, bow, neck);
  const nx = -neckTangent.y;
  const ny = neckTangent.x;
  const barb = width * 1.05;
  const apex = arrowSpine(from, to, bow, tip);

  return [
    ...left,
    vec2(neckPoint.x + nx * barb, neckPoint.y + ny * barb),
    apex,
    vec2(neckPoint.x - nx * barb, neckPoint.y - ny * barb),
    ...right.reverse(),
  ];
}

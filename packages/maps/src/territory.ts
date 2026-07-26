/**
 * Territory animation geometry (M7.3, plan §5.2): pure helpers the render
 * tier uses to draw region verbs.
 *
 * - recolor sweep: the new color wipes across the region — a polygon
 *   clipped to the moving front (Sutherland–Hodgman against a half-plane),
 * - territory morph: cartoon border change — both rings resampled to the
 *   same point count and lerped point-wise,
 * - highlight: an opacity pulse the caller drives (helper for the curve).
 */

import { vec2, type Vec2 } from '@motionforge/core';

/** Clip a polygon to the half-plane x ≤ frontX (the sweep wipe). */
export function clipToFront(points: readonly Vec2[], frontX: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const aIn = a.x <= frontX;
    const bIn = b.x <= frontX;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (frontX - a.x) / (b.x - a.x);
      out.push(vec2(frontX, a.y + t * (b.y - a.y)));
    }
  }
  return out;
}

const perimeter = (ring: readonly Vec2[]): number => {
  let length = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
};

const ringArea = (ring: readonly Vec2[]): number => {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
};

/**
 * Resample a closed ring to `count` points by arc length, starting at the
 * ring's topmost point and running counter-clockwise — a canonical form so
 * two resampled rings correspond point-for-point.
 */
export function resampleRing(ring: readonly Vec2[], count: number): Vec2[] {
  if (ring.length === 0) return [];
  // Canonical orientation + start.
  const ccw = ringArea(ring) >= 0 ? [...ring] : [...ring].reverse();
  let top = 0;
  for (let i = 1; i < ccw.length; i++) {
    if (ccw[i]!.y > ccw[top]!.y) top = i;
  }
  const canon = [...ccw.slice(top), ...ccw.slice(0, top)];

  const total = perimeter(canon);
  if (total === 0) return Array.from({ length: count }, () => canon[0]!);
  const step = total / count;
  const out: Vec2[] = [];
  let travelled = 0;
  let segment = 0;
  let segmentStart = 0;
  const segLength = (i: number): number => {
    const a = canon[i]!;
    const b = canon[(i + 1) % canon.length]!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  let currentLength = segLength(0);
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (travelled + currentLength < target && segment < canon.length * 2) {
      travelled += currentLength;
      segment = (segment + 1) % canon.length;
      segmentStart = travelled;
      currentLength = segLength(segment);
    }
    const a = canon[segment]!;
    const b = canon[(segment + 1) % canon.length]!;
    const t = currentLength === 0 ? 0 : (target - segmentStart) / currentLength;
    out.push(vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
  }
  return out;
}

/** Point-wise lerp of two canonicalized rings — the border morph. */
export function morphRings(
  from: readonly Vec2[],
  to: readonly Vec2[],
  t: number,
  count = 64,
): Vec2[] {
  const a = resampleRing(from, count);
  const b = resampleRing(to, count);
  return a.map((p, i) => vec2(p.x + (b[i]!.x - p.x) * t, p.y + (b[i]!.y - p.y) * t));
}

/** Highlight pulse curve: `pulses` soft beats over t ∈ [0,1], peak 1. */
export function highlightPulse(t: number, pulses = 3): number {
  if (t <= 0 || t >= 1) return 0;
  return Math.abs(Math.sin(t * Math.PI * pulses)) * Math.sin(Math.PI * t) ** 0.35;
}

/** Pack an RGB color into one number for FilmEffect params. */
export const packColor = (r: number, g: number, b: number): number =>
  ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

export const unpackColor = (packed: number): { r: number; g: number; b: number; a: number } => ({
  r: (packed >> 16) & 0xff,
  g: (packed >> 8) & 0xff,
  b: packed & 0xff,
  a: 1,
});

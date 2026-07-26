import { vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { arrowPolygon, arrowSpine } from './arrows.js';

const from = vec2(0, 0);
const to = vec2(4, 0);

describe('offensive arrows (M7.4)', () => {
  it('spine is a quadratic bezier hitting both endpoints', () => {
    expect(arrowSpine(from, to, 0.2, 0)).toEqual(from);
    expect(arrowSpine(from, to, 0.2, 1)).toEqual(to);
    // Positive bow pushes the midpoint off-axis.
    expect(Math.abs(arrowSpine(from, to, 0.2, 0.5).y)).toBeGreaterThan(0.2);
  });

  it('grows monotonically and lands its apex on the target', () => {
    const straight = { width: 0.3, bow: 0 };
    expect(arrowPolygon(from, to, 0, straight)).toEqual([]);
    const half = arrowPolygon(from, to, 0.5, straight);
    const full = arrowPolygon(from, to, 1, straight);
    const reach = (poly: { x: number }[]) => Math.max(...poly.map((p) => p.x));
    expect(reach(half)).toBeGreaterThan(1.4);
    expect(reach(half)).toBeLessThan(reach(full));
    expect(reach(full)).toBeCloseTo(4, 6);
    // Closed fat polygon: ribbon sides + 3 head points.
    expect(full.length).toBeGreaterThan(20);
  });

  it('the head barbs sit wider than the body', () => {
    const poly = arrowPolygon(from, to, 1, { width: 0.3, bow: 0 });
    const maxHalfWidth = Math.max(...poly.map((p) => Math.abs(p.y)));
    expect(maxHalfWidth).toBeGreaterThan(0.15 * 1.5);
  });

  it('is pure', () => {
    expect(arrowPolygon(from, to, 0.7)).toEqual(arrowPolygon(from, to, 0.7));
  });
});

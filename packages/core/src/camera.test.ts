import { describe, expect, it } from 'vitest';

import {
  CAMERA_MAX_ZOOM,
  cameraTransform,
  cameraView,
  clampCamera,
  clampZoom,
  DEFAULT_CAMERA,
  letterboxBars,
  WORLD_UNITS_PER_VIEW_HEIGHT,
} from './camera.js';
import { apply, vec2 } from './math.js';

const viewport = { width: 1920, height: 1080 };

describe('camera rig (M10.1)', () => {
  it('maps the camera position to the screen center, y flipped', () => {
    const t = cameraTransform({ pos: vec2(3, -2), zoom: 1 }, viewport);
    expect(apply(t, vec2(3, -2))).toEqual(vec2(960, 540));
    // One world unit up = viewportHeight / 10 pixels up (smaller y).
    const up = apply(t, vec2(3, -1));
    expect(up.x).toBe(960);
    expect(up.y).toBeCloseTo(540 - 1080 / WORLD_UNITS_PER_VIEW_HEIGHT, 9);
  });

  it('zoom scales about the screen center', () => {
    const t = cameraTransform({ pos: vec2(0, 0), zoom: 2 }, viewport);
    expect(apply(t, vec2(0, 0))).toEqual(vec2(960, 540));
    expect(apply(t, vec2(1, 0)).x).toBeCloseTo(960 + 2 * (1080 / 10), 9);
  });

  it('the default camera transform matches the frame convention', () => {
    const t = cameraTransform(DEFAULT_CAMERA, viewport);
    // Top of the world view (y = +5) is the top edge of the screen.
    expect(apply(t, vec2(0, 5)).y).toBeCloseTo(0, 9);
    expect(apply(t, vec2(0, -5)).y).toBeCloseTo(1080, 9);
  });

  it('cameraView reports the visible world rect', () => {
    const view = cameraView({ pos: vec2(2, 1), zoom: 2 }, viewport);
    expect(view.min.y).toBeCloseTo(1 - 2.5, 9);
    expect(view.max.y).toBeCloseTo(1 + 2.5, 9);
    // 16:9 → half width = half height × aspect.
    expect(view.max.x - view.min.x).toBeCloseTo(5 * (16 / 9), 9);
  });

  it('clampZoom holds the documented range', () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(40)).toBe(CAMERA_MAX_ZOOM);
  });

  describe('clampCamera', () => {
    const bounds = { min: vec2(-20, -10), max: vec2(20, 10) };

    it('leaves a view already inside the bounds alone', () => {
      const state = { pos: vec2(0, 0), zoom: 1 };
      expect(clampCamera(state, bounds, viewport)).toEqual(state);
    });

    it('clamps the position so the view edge stays inside', () => {
      const clamped = clampCamera({ pos: vec2(19, 9), zoom: 1 }, bounds, viewport);
      // half view: 8.89 wide, 5 tall → pos limited to bounds minus half view.
      expect(clamped.pos.x).toBeCloseTo(20 - 5 * (16 / 9), 6);
      expect(clamped.pos.y).toBeCloseTo(10 - 5, 6);
      expect(clamped.zoom).toBe(1);
    });

    it('zooms in when the view is larger than the bounds', () => {
      const tight = { min: vec2(-4, -2), max: vec2(4, 2) };
      const clamped = clampCamera({ pos: vec2(0, 0), zoom: 1 }, tight, viewport);
      // Needs zoom 10/4 = 2.5 vertically and 10·(16/9)/8 ≈ 2.22 horizontally.
      expect(clamped.zoom).toBeCloseTo(2.5, 9);
    });

    it('centers an axis whose bounds cannot fit even at max zoom', () => {
      const sliver = { min: vec2(-0.5, -10), max: vec2(0.5, 10) };
      const clamped = clampCamera({ pos: vec2(7, 0), zoom: 1 }, sliver, viewport);
      expect(clamped.zoom).toBe(CAMERA_MAX_ZOOM);
      expect(clamped.pos.x).toBe(0);
    });
  });

  describe('letterboxBars', () => {
    it('masks a 16:9 frame down to 2.35:1 with symmetric top/bottom bars', () => {
      const bars = letterboxBars(viewport, 2.35);
      expect(bars).toHaveLength(2);
      const [top, bottom] = bars;
      expect(top!.y).toBe(0);
      expect(top!.width).toBe(1920);
      expect(top!.height).toBeCloseTo((1080 - 1920 / 2.35) / 2, 9);
      expect(bottom!.y + bottom!.height).toBeCloseTo(1080, 9);
      expect(top!.height).toBeCloseTo(bottom!.height, 9);
    });

    it('pillarboxes a narrower target', () => {
      const bars = letterboxBars(viewport, 1);
      expect(bars).toHaveLength(2);
      expect(bars[0]!.width).toBeCloseTo((1920 - 1080) / 2, 9);
      expect(bars[0]!.height).toBe(1080);
    });

    it('matching aspect needs no bars', () => {
      expect(letterboxBars(viewport, 16 / 9)).toHaveLength(0);
    });
  });
});

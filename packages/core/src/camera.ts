/**
 * Camera rig (M10.1, plan §5): the film camera as one value — position +
 * zoom over the y-up world — with everything that depends on it defined
 * here once: the world→screen transform, the zoom limits, world-bounds
 * clamping (never show past the edge of a stage or map), and cinematic
 * letterbox bar geometry. The frame builder, the compiler's `zoom-to`,
 * and the M10 camera moves all consume this module, so "what the camera
 * sees" has a single definition.
 */

import { ease } from './easing.js';
import {
  clamp,
  compose,
  lerpVec2,
  scaling,
  translation,
  vec2,
  ZERO,
  type Transform,
  type Vec2,
} from './math.js';

/** World units spanning the viewport height at zoom 1 (schema doc). */
export const WORLD_UNITS_PER_VIEW_HEIGHT = 10;

/** Zoom limits: wider than 0.5× shrinks the ink to mush; past 6× the
 * vector shapes read as raw geometry. `zoom-to` and camera moves clamp
 * through here. */
export const CAMERA_MIN_ZOOM = 0.5;
export const CAMERA_MAX_ZOOM = 6;

/** The camera as a value: where it looks and how tight. */
export interface CameraState {
  readonly pos: Vec2;
  readonly zoom: number;
}

export const DEFAULT_CAMERA: CameraState = { pos: ZERO, zoom: 1 };

/** Output pixel viewport. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Axis-aligned world rectangle, y-up. */
export interface WorldRect {
  readonly min: Vec2;
  readonly max: Vec2;
}

/** Screen-pixel rectangle, y-down (SVG convention). */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const clampZoom = (zoom: number): number => clamp(zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);

/** The world rectangle visible on the depth-0.5 (parallax-neutral) plane. */
export function cameraView(state: CameraState, viewport: Viewport): WorldRect {
  const halfH = WORLD_UNITS_PER_VIEW_HEIGHT / 2 / state.zoom;
  const halfW = halfH * (viewport.width / viewport.height);
  return {
    min: vec2(state.pos.x - halfW, state.pos.y - halfH),
    max: vec2(state.pos.x + halfW, state.pos.y + halfH),
  };
}

/**
 * World → screen-pixel transform: `pos` lands on the screen center, y is
 * flipped, and `WORLD_UNITS_PER_VIEW_HEIGHT / zoom` world units span the
 * viewport height.
 */
export function cameraTransform(state: CameraState, viewport: Viewport): Transform {
  const unit = (viewport.height / WORLD_UNITS_PER_VIEW_HEIGHT) * state.zoom;
  return compose(
    translation(viewport.width / 2, viewport.height / 2),
    compose(scaling(unit, -unit), translation(-state.pos.x, -state.pos.y)),
  );
}

/**
 * Keep the whole view inside `bounds`: zoom in as far as needed for the
 * view to fit, then clamp the position. An axis whose bounds are still
 * narrower than the view (even at CAMERA_MAX_ZOOM) centers on it instead
 * of jittering between the two edges.
 */
export function clampCamera(
  state: CameraState,
  bounds: WorldRect,
  viewport: Viewport,
): CameraState {
  const aspect = viewport.width / viewport.height;
  const boundsW = bounds.max.x - bounds.min.x;
  const boundsH = bounds.max.y - bounds.min.y;
  const zoom = clampZoom(
    Math.max(
      state.zoom,
      WORLD_UNITS_PER_VIEW_HEIGHT / boundsH,
      (WORLD_UNITS_PER_VIEW_HEIGHT * aspect) / boundsW,
    ),
  );
  const halfH = WORLD_UNITS_PER_VIEW_HEIGHT / 2 / zoom;
  const halfW = halfH * aspect;
  const axis = (value: number, lo: number, hi: number, half: number): number =>
    hi - lo < half * 2 ? (lo + hi) / 2 : clamp(value, lo + half, hi - half);
  return {
    pos: vec2(
      axis(state.pos.x, bounds.min.x, bounds.max.x, halfW),
      axis(state.pos.y, bounds.min.y, bounds.max.y, halfH),
    ),
    zoom,
  };
}

// ---- camera moves (M10.2) --------------------------------------------------

/**
 * Zoom-punch envelope: snap in over the first fifth (with a little backOut
 * overshoot past 1 — the "punch"), hold the tight framing, then release
 * smoothly. 0 outside the window.
 */
export function zoomPunchEnvelope(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < 0.2) return ease('backOut', t / 0.2);
  if (t < 0.55) return 1;
  return 1 - ease('cubicInOut', (t - 0.55) / 0.45);
}

/** Zoom multiplier over a zoom-punch of strength `punch` (peak ×zoom). */
export const zoomPunchZoom = (t: number, punch: number): number =>
  1 + (punch - 1) * zoomPunchEnvelope(t);

/**
 * Re-aim a camera so multiplying its zoom by `m` zooms about the world
 * point `aim` — the aim keeps its exact screen position while everything
 * else rushes past it. This is what makes a punch read as "into the face"
 * rather than "into the middle of the screen".
 */
export function zoomAboutPoint(state: CameraState, aim: Vec2, m: number): CameraState {
  return {
    pos: vec2(aim.x + (state.pos.x - aim.x) / m, aim.y + (state.pos.y - aim.y) / m),
    zoom: state.zoom * m,
  };
}

/** Zoom dip riding a whip-pan — a slight mid-move pull-back reads as speed. */
export const whipZoomDip = (t: number, dip = 0.07): number =>
  1 - dip * Math.sin(Math.PI * clamp(t, 0, 1));

/** How far a zoom-punch recenters toward its aim at full envelope. */
export const ZOOM_PUNCH_CENTER_PULL = 0.35;

/**
 * The full zoom-punch move: snap-zoom about the aim while gliding the
 * framing toward it — the face grows *and* slides toward frame center,
 * the way a camera operator would actually punch in on a reaction.
 * Continuous at both ends (envelope 0 → the input camera, untouched).
 */
export function zoomPunchCamera(
  state: CameraState,
  aim: Vec2,
  t: number,
  punch: number,
): CameraState {
  const env = zoomPunchEnvelope(t);
  const pulled: CameraState = {
    pos: lerpVec2(state.pos, aim, ZOOM_PUNCH_CENTER_PULL * env),
    zoom: state.zoom,
  };
  return zoomAboutPoint(pulled, aim, 1 + (punch - 1) * env);
}

/**
 * Cinematic letterbox: the black bars that mask the frame down to
 * `targetAspect`. Wider targets get top/bottom bars, narrower targets get
 * left/right pillars, a matching aspect gets none.
 */
export function letterboxBars(viewport: Viewport, targetAspect: number): readonly ScreenRect[] {
  const { width, height } = viewport;
  const frameAspect = width / height;
  const epsilon = 1e-6;
  if (targetAspect > frameAspect + epsilon) {
    const bar = (height - width / targetAspect) / 2;
    return [
      { x: 0, y: 0, width, height: bar },
      { x: 0, y: height - bar, width, height: bar },
    ];
  }
  if (targetAspect < frameAspect - epsilon) {
    const bar = (width - height * targetAspect) / 2;
    return [
      { x: 0, y: 0, width: bar, height },
      { x: width - bar, y: 0, width: bar, height },
    ];
  }
  return [];
}

/**
 * Custom/historical regions + alliance groups (M7.2, plan §5.2).
 *
 * History rarely matches modern borders: authors hand-draw simplified
 * lon/lat rings for empires ("austria-hungary") that either overlay the
 * base map or replace present-day regions. Groups name alliances so verbs
 * can target "central-powers" as one thing.
 */

import { vec2, type Vec2 } from '@motionforge/core';

import type { MapRegion, MapSpec } from './geojson.js';

export interface CustomRegionDef {
  /** Hand-authored lon/lat ring — blobby on purpose, no simplification. */
  readonly points: readonly (readonly [number, number])[];
  /** Region ids this historical region swallows (removed from the map). */
  readonly replace?: readonly string[];
}

const ringArea = (ring: readonly Vec2[]): number => {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
};

const ringCentroid = (ring: readonly Vec2[]): Vec2 => {
  const area = ringArea(ring);
  if (Math.abs(area) < 1e-9) return ring[0] ?? vec2(0, 0);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return vec2(cx / (6 * area), cy / (6 * area));
};

/**
 * Apply custom regions to a compiled map. Replaced regions disappear;
 * customs append after the base regions so they paint on top (overlays).
 * A custom region may reuse a replaced id (redrawing "germany" c. 1914).
 */
export function applyCustomRegions(
  spec: MapSpec,
  defs: Readonly<Record<string, CustomRegionDef>>,
): MapSpec {
  const names = Object.keys(defs);
  if (names.length === 0) return spec;

  const lonSpan = spec.view.lonMax - spec.view.lonMin;
  const latSpan = spec.view.latMax - spec.view.latMin;
  const project = (lon: number, lat: number): Vec2 =>
    vec2(
      ((lon - spec.view.lonMin) / lonSpan - 0.5) * spec.width,
      ((lat - spec.view.latMin) / latSpan - 0.5) * spec.height,
    );

  const replaced = new Set(names.flatMap((name) => defs[name]!.replace ?? []));
  const kept = spec.regions.filter((region) => !replaced.has(region.id));

  const customs: MapRegion[] = names.map((name) => {
    const def = defs[name]!;
    if (def.points.length < 3) {
      throw new Error(`Custom region "${name}" needs at least 3 points`);
    }
    const ring = def.points.map(([lon, lat]) => project(lon, lat));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of ring) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return {
      id: name,
      name,
      rings: [ring],
      centroid: ringCentroid(ring),
      bbox: { min: vec2(minX, minY), max: vec2(maxX, maxY) },
    };
  });

  return { ...spec, regions: [...kept, ...customs] };
}

/** Alliance groups: name → member region ids. */
export type MapGroups = Readonly<Record<string, readonly string[]>>;

/** Validate groups against the map's regions (throws listing unknowns). */
export function validateGroups(spec: MapSpec, groups: MapGroups): void {
  const ids = new Set(spec.regions.map((r) => r.id));
  for (const [group, members] of Object.entries(groups)) {
    const unknown = members.filter((m) => !ids.has(m));
    if (unknown.length > 0) {
      throw new Error(
        `Map group "${group}" names unknown region(s): ${unknown.join(', ')} — ` +
          `available: ${[...ids].join(', ')}`,
      );
    }
  }
}

/**
 * Expand a verb target to region ids: a group name expands to its members,
 * a region id passes through, anything else throws with the options.
 */
export function expandTarget(spec: MapSpec, groups: MapGroups, target: string): readonly string[] {
  const members = groups[target];
  if (members) return members;
  if (spec.regions.some((r) => r.id === target)) return [target];
  throw new Error(
    `Unknown map target "${target}" — regions: ${spec.regions.map((r) => r.id).join(', ')}` +
      (Object.keys(groups).length > 0 ? `; groups: ${Object.keys(groups).join(', ')}` : ''),
  );
}

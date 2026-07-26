/**
 * GeoJSON → MapSpec compiler (M7.1, plan §5.2 + ADR-0007). Takes a parsed
 * Natural Earth FeatureCollection (vendored under assets/geodata/), then:
 *
 * 1. projects (equirectangular) into world units, y-up, centered on the
 *    viewport — the same units every other scene node uses,
 * 2. simplifies each ring (Douglas–Peucker) to genre-appropriately blobby
 *    cartoon borders,
 * 3. names every region (kebab-case ids from the data) with centroid and
 *    bbox, so verbs and `zoom-to region:` can target them.
 *
 * Pure: same collection + options → same MapSpec, always. File I/O stays
 * with the caller (CLI/lang load the vendored JSON once).
 */

import { vec2, type Vec2 } from '@motionforge/core';

export interface GeoFeature {
  readonly properties: { readonly name: string; readonly id: string; readonly iso_a3?: string };
  readonly geometry: {
    readonly type: 'Polygon' | 'MultiPolygon';
    readonly coordinates: number[][][] | number[][][][];
  };
}

export interface GeoCollection {
  readonly features: readonly GeoFeature[];
}

/** Lon/lat window the map shows (defaults to the Europe theater). */
export interface GeoView {
  readonly lonMin: number;
  readonly lonMax: number;
  readonly latMin: number;
  readonly latMax: number;
}

export const EUROPE_VIEW: GeoView = { lonMin: -12, lonMax: 42, latMin: 34, latMax: 62 };

export interface CompileMapOptions {
  readonly view?: GeoView;
  /** Map width in world units (height follows the view's aspect). */
  readonly widthUnits?: number;
  /** Douglas–Peucker tolerance in world units. */
  readonly simplifyTolerance?: number;
}

export interface MapRegion {
  readonly id: string;
  readonly name: string;
  /** Simplified outer rings (one per polygon), world units, y-up. */
  readonly rings: readonly (readonly Vec2[])[];
  /** Area-weighted centroid of the largest ring. */
  readonly centroid: Vec2;
  readonly bbox: { readonly min: Vec2; readonly max: Vec2 };
}

export interface MapSpec {
  /** World units. */
  readonly width: number;
  readonly height: number;
  readonly view: GeoView;
  readonly regions: readonly MapRegion[];
}

/** Douglas–Peucker ring simplification (iterative, tolerance in units). */
export function simplifyRing(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length < 4) return [...points];
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const ax = points[a]!.x;
    const ay = points[a]!.y;
    const dx = points[b]!.x - ax;
    const dy = points[b]!.y - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let maxD = 0;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(
        0,
        Math.min(1, ((points[i]!.x - ax) * dx + (points[i]!.y - ay) * dy) / len2),
      );
      const ex = points[i]!.x - (ax + t * dx);
      const ey = points[i]!.y - (ay + t * dy);
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > sqTol && maxI >= 0) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
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

/** Compile a feature collection into a stylable, targetable MapSpec. */
export function compileMap(geo: GeoCollection, options: CompileMapOptions = {}): MapSpec {
  const view = options.view ?? EUROPE_VIEW;
  const width = options.widthUnits ?? 16;
  const lonSpan = view.lonMax - view.lonMin;
  const latSpan = view.latMax - view.latMin;
  const height = (latSpan / lonSpan) * width;
  const tolerance = options.simplifyTolerance ?? 0.05;

  const project = (lon: number, lat: number): Vec2 =>
    vec2(
      ((lon - view.lonMin) / lonSpan - 0.5) * width,
      ((lat - view.latMin) / latSpan - 0.5) * height,
    );

  // Rings that never touch the viewport (overseas territories, far-east
  // extents) are dropped — they'd paint distracting blobs off the theater.
  const marginX = width * 0.3;
  const marginY = height * 0.3;
  const touchesView = (ring: readonly Vec2[]): boolean =>
    ring.some((p) => Math.abs(p.x) <= width / 2 + marginX && Math.abs(p.y) <= height / 2 + marginY);

  const regions: MapRegion[] = geo.features.map((feature) => {
    const polys =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates as number[][][]]
        : (feature.geometry.coordinates as number[][][][]);
    // Outer ring per polygon (holes are noise at cartoon scale).
    const rings = polys
      .map((poly) => {
        const projected = poly[0]!.map(([lon, lat]) => project(lon!, lat!));
        const simplified = simplifyRing(projected, tolerance);
        // Tiny regions must survive simplification — fall back to raw.
        return simplified.length >= 4 ? simplified : projected;
      })
      .filter((ring) => ring.length >= 4 && touchesView(ring));
    const largest = rings.reduce(
      (best, ring) => (Math.abs(ringArea(ring)) > Math.abs(ringArea(best)) ? ring : best),
      rings[0] ?? [],
    );
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
      for (const point of ring) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
    return {
      id: feature.properties.id,
      name: feature.properties.name,
      rings,
      centroid: largest.length > 0 ? ringCentroid(largest) : vec2(0, 0),
      bbox: { min: vec2(minX, minY), max: vec2(maxX, maxY) },
    };
  });

  return { width, height, view, regions };
}

/** Look a region up by id, with the available ids in the error. */
export function regionOf(spec: MapSpec, id: string): MapRegion {
  const region = spec.regions.find((r) => r.id === id);
  if (!region) {
    throw new Error(
      `Unknown map region "${id}" — available: ${spec.regions.map((r) => r.id).join(', ')}`,
    );
  }
  return region;
}

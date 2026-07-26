import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { instantiateObject, vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { compileMap, EUROPE_VIEW, regionOf, simplifyRing, type GeoCollection } from './geojson.js';
import { mapObjectSpec } from './style.js';

const here = dirname(fileURLToPath(import.meta.url));
const europe: GeoCollection = JSON.parse(
  readFileSync(join(here, '../../../assets/geodata/ne_110m_europe.json'), 'utf8'),
) as GeoCollection;

describe('geojson compiler (M7.1)', () => {
  const map = compileMap(europe);

  it('compiles the vendored Europe subset with kebab region ids', () => {
    expect(map.regions.length).toBeGreaterThanOrEqual(35);
    for (const region of map.regions) {
      expect(region.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(region.rings.length).toBeGreaterThan(0);
    }
    expect(regionOf(map, 'france').name).toBe('France');
    expect(() => regionOf(map, 'atlantis')).toThrow(/available:/);
  });

  it('projects into centered, y-up world units', () => {
    expect(map.width).toBe(16);
    expect(map.height).toBeCloseTo((28 / 54) * 16, 6);
    // North is up: Norway sits above Greece.
    expect(regionOf(map, 'norway').centroid.y).toBeGreaterThan(regionOf(map, 'greece').centroid.y);
    // West is left: Portugal sits left of Poland.
    expect(regionOf(map, 'portugal').centroid.x).toBeLessThan(regionOf(map, 'poland').centroid.x);
    // Theater countries land inside the viewport.
    for (const id of ['france', 'poland', 'italy', 'serbia']) {
      expect(Math.abs(regionOf(map, id).centroid.x)).toBeLessThan(map.width / 2);
      expect(Math.abs(regionOf(map, id).centroid.y)).toBeLessThan(map.height / 2);
    }
  });

  it('drops off-theater rings (overseas territories) but keeps the mainland', () => {
    const france = regionOf(map, 'france');
    // French Guiana (lon ≈ −53°) must not survive the view filter.
    for (const ring of france.rings) {
      expect(Math.min(...ring.map((p) => p.x))).toBeGreaterThan(-map.width);
    }
    expect(france.rings.length).toBeGreaterThan(0);
  });

  it('simplifies borders hard but keeps closed shapes', () => {
    const raw = compileMap(europe, { simplifyTolerance: 0 });
    const rawPoints = raw.regions.reduce(
      (n, r) => n + r.rings.reduce((m, ring) => m + ring.length, 0),
      0,
    );
    const simplified = map.regions.reduce(
      (n, r) => n + r.rings.reduce((m, ring) => m + ring.length, 0),
      0,
    );
    expect(simplified).toBeLessThan(rawPoints * 0.8);
    for (const region of map.regions) {
      expect(region.rings.length).toBeGreaterThan(0);
      for (const ring of region.rings) expect(ring.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('is a pure function of its inputs', () => {
    expect(compileMap(europe)).toEqual(map);
  });

  it('simplifyRing keeps endpoints and collinear tolerance', () => {
    const line = [vec2(0, 0), vec2(0.001, 0.5), vec2(0, 1), vec2(1, 1), vec2(0, 0)];
    const out = simplifyRing(line, 0.01);
    expect(out[0]).toEqual(vec2(0, 0));
    expect(out[out.length - 1]).toEqual(vec2(0, 0));
    expect(out.length).toBeLessThan(line.length);
  });

  it('styles into an object part-tree addressable by region id', () => {
    const spec = mapObjectSpec(map, 'paper');
    expect(spec.parts.length).toBe(map.regions.length);
    const france = spec.parts.find((p) => p.id === 'france')!;
    expect(france.children!.length).toBeGreaterThan(0);
    expect(france.children![0]!.shape!.kind).toBe('polygon');
    // The whole map instantiates cleanly through the object system.
    const node = instantiateObject(spec, { idPrefix: 'map', layerBase: 0 });
    expect(node.id).toBe('map/object');
    const flat = JSON.stringify(node);
    expect(flat).toContain('map/france');
    // Deterministic tints.
    expect(mapObjectSpec(map, 'paper')).toEqual(spec);
  });

  it('respects a custom view window', () => {
    const balkans = compileMap(europe, {
      view: { lonMin: 18, lonMax: 30, latMin: 39, latMax: 47 },
      widthUnits: 10,
    });
    expect(balkans.width).toBe(10);
    expect(Math.abs(regionOf(balkans, 'serbia').centroid.x)).toBeLessThan(3);
    expect(balkans.view).not.toEqual(EUROPE_VIEW);
  });
});

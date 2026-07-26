import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compileMap, regionOf, type GeoCollection } from './geojson.js';
import { applyCustomRegions, expandTarget, validateGroups } from './overlays.js';
import { mapObjectSpec } from './style.js';

const here = dirname(fileURLToPath(import.meta.url));
const europe: GeoCollection = JSON.parse(
  readFileSync(join(here, '../../../assets/geodata/ne_110m_europe.json'), 'utf8'),
) as GeoCollection;

const base = compileMap(europe);

// A blobby 1914-ish Austria-Hungary swallowing the modern successors.
const AUSTRIA_HUNGARY = {
  points: [
    [9.5, 47.6],
    [12.2, 49.2],
    [16.9, 49.6],
    [21.2, 49.9],
    [26.3, 48.2],
    [26.0, 45.5],
    [20.3, 44.2],
    [16.4, 43.2],
    [13.4, 45.4],
    [9.7, 46.4],
  ] as [number, number][],
  replace: ['austria', 'hungary', 'czech-republic', 'croatia', 'bosnia-and-herzegovina'],
};

describe('custom regions and groups (M7.2)', () => {
  it('replaces modern regions with a historical overlay', () => {
    const map = applyCustomRegions(base, { 'austria-hungary': AUSTRIA_HUNGARY });
    expect(map.regions.some((r) => r.id === 'austria')).toBe(false);
    expect(map.regions.some((r) => r.id === 'hungary')).toBe(false);
    const empire = regionOf(map, 'austria-hungary');
    expect(empire.rings[0]!.length).toBe(AUSTRIA_HUNGARY.points.length);
    // Sits roughly where central Europe is (right of France, above Greece).
    expect(empire.centroid.x).toBeGreaterThan(regionOf(map, 'france').centroid.x);
    expect(empire.centroid.y).toBeGreaterThan(regionOf(map, 'greece').centroid.y);
    // Overlays paint after (on top of) the base regions.
    expect(map.regions[map.regions.length - 1]!.id).toBe('austria-hungary');
  });

  it('keeps the base map untouched when no customs are given', () => {
    expect(applyCustomRegions(base, {})).toBe(base);
    expect(() =>
      applyCustomRegions(base, {
        blob: {
          points: [
            [0, 40],
            [1, 41],
          ],
        },
      }),
    ).toThrow(/at least 3/);
  });

  it('styles custom regions like any other part', () => {
    const map = applyCustomRegions(base, { 'austria-hungary': AUSTRIA_HUNGARY });
    const spec = mapObjectSpec(map);
    expect(spec.parts.some((p) => p.id === 'austria-hungary')).toBe(true);
    expect(spec.parts.some((p) => p.id === 'austria')).toBe(false);
  });

  it('validates groups against region ids', () => {
    const map = applyCustomRegions(base, { 'austria-hungary': AUSTRIA_HUNGARY });
    const groups = {
      'central-powers': ['germany', 'austria-hungary'],
      entente: ['france', 'russian-federation', 'united-kingdom'],
    };
    expect(() => validateGroups(map, groups)).not.toThrow();
    expect(() => validateGroups(map, { bad: ['narnia'] })).toThrow(/narnia/);
  });

  it('expands verb targets: groups → members, regions pass through', () => {
    const groups = { entente: ['france', 'russian-federation'] };
    expect(expandTarget(base, groups, 'entente')).toEqual(['france', 'russian-federation']);
    expect(expandTarget(base, groups, 'italy')).toEqual(['italy']);
    expect(() => expandTarget(base, groups, 'mordor')).toThrow(/groups: entente/);
  });
});

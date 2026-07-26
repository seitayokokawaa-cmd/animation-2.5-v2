/**
 * Map styling (M7.1): a compiled MapSpec becomes an object part-tree, so
 * every existing object mechanism (instancing, tint, articulation targets,
 * painter layers) applies to maps unchanged (plan §5.2).
 *
 * Paper style: parchment land in gently varied tints (seeded, stable per
 * region index), soft dark coast ink. The sea is whatever lies behind the
 * map instance — usually the scene backdrop.
 */

import {
  hashNoise,
  parseColor,
  type Color,
  type ObjectSpec,
  type PartSpec,
} from '@motionforge/core';

import type { MapSpec } from './geojson.js';

export type MapStyleName = 'paper' | 'clean';

interface MapStyle {
  readonly landTints: readonly Color[];
  readonly coast: Color;
  readonly coastWidth: number;
}

const MAP_STYLES: Record<MapStyleName, MapStyle> = {
  paper: {
    landTints: [
      parseColor('#e8dcc0'),
      parseColor('#e2d3b2'),
      parseColor('#ecdfc6'),
      parseColor('#ddceab'),
    ],
    coast: parseColor('#6b5b43'),
    coastWidth: 0.03,
  },
  clean: {
    landTints: [parseColor('#dfe5ea'), parseColor('#d3dbe2'), parseColor('#e6ebef')],
    coast: parseColor('#5f6a75'),
    coastWidth: 0.025,
  },
};

/**
 * Build the map's ObjectSpec. Each region is a part named by its region id
 * (multi-polygon regions add `<id>/1`, `<id>/2`, … siblings), so region
 * verbs and articulation targets address `map-instance.region-id` directly.
 */
export function mapObjectSpec(spec: MapSpec, styleName: MapStyleName = 'paper'): ObjectSpec {
  const style = MAP_STYLES[styleName];
  // Regions that fell entirely outside the view have no geometry to draw.
  const drawable = spec.regions.filter((region) => region.rings.length > 0);
  const parts: PartSpec[] = drawable.map((region, index): PartSpec => {
    const tint = style.landTints[(hashNoise(0, 'map/tint', index) * style.landTints.length) | 0]!;
    const rings = region.rings.map((ring, ri): PartSpec => ({
      id: ri === 0 ? `${region.id}-main` : `${region.id}-${ri}`,
      z: 1,
      shape: { kind: 'polygon', points: [...ring] },
      fill: { color: tint },
      stroke: { color: style.coast, width: style.coastWidth },
    }));
    return { id: region.id, z: index + 1, children: rings };
  });
  return { params: {}, parts };
}

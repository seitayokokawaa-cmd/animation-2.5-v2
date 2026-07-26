/**
 * Object instancing (M5.2): a compiled object spec (part tree) becomes a
 * SceneNode tree at placement, with color params resolved, optional
 * horizontal flip, uniform scale, and multiply-tint. Part draw order
 * inside an object is tree order (or explicit `z`), enforced with
 * explicit layers so the painter's screen-y tiebreak can never scramble
 * an object's internals.
 */

import { rgba, type Color } from './color.js';
import { compose, rotation, scaling, translation, vec2, type Vec2 } from './math.js';
import type { Fill, SceneNode, Shape, Stroke } from './scene.js';

export interface PartSpec {
  readonly id: string;
  readonly at?: Vec2;
  /** Radians. */
  readonly rotate?: number;
  readonly scale?: number;
  /** Rotation origin for articulation, part-local units. Default origin. */
  readonly pivot?: Vec2;
  /** Explicit draw order inside the object; default tree order. */
  readonly z?: number;
  readonly shape?: Shape;
  readonly fill?: Fill | { readonly param: string };
  readonly stroke?: Stroke;
  readonly children?: readonly PartSpec[];
}

export interface ObjectSpec {
  /** Color slots with defaults. */
  readonly params: Readonly<Record<string, Color>>;
  readonly parts: readonly PartSpec[];
}

export interface InstantiateOptions {
  /** Node-id prefix, e.g. the instance name — ids become `<prefix>/<part>`. */
  readonly idPrefix: string;
  /** Layer for the first part; subsequent parts stack upward. */
  readonly layerBase?: number;
  readonly params?: Readonly<Record<string, Color>>;
  readonly scale?: number;
  readonly flip?: boolean;
  /** Channel-wise multiply applied to every resolved fill/stroke color. */
  readonly tint?: Color;
}

const tintColor = (c: Color, tint: Color): Color =>
  rgba((c.r * tint.r) / 255, (c.g * tint.g) / 255, (c.b * tint.b) / 255, c.a * tint.a);

/**
 * The transform that rotates/scales a part about its pivot:
 * translate(at) · translate(pivot) · rotate · scale · translate(-pivot).
 */
export function partTransform(
  at: Vec2,
  pivot: Vec2,
  rotate: number,
  scale: number,
): ReturnType<typeof compose> {
  return compose(
    translation(at.x + pivot.x, at.y + pivot.y),
    compose(compose(rotation(rotate), scaling(scale, scale)), translation(-pivot.x, -pivot.y)),
  );
}

export function instantiateObject(spec: ObjectSpec, options: InstantiateOptions): SceneNode {
  const params = { ...spec.params, ...options.params };
  const tint = options.tint;
  let order = 0;

  const resolveFill = (fill: PartSpec['fill'], partId: string): Fill | undefined => {
    if (!fill) return undefined;
    if ('param' in fill) {
      const color = params[fill.param];
      if (!color) {
        throw new Error(`Object part "${partId}" references unknown color param "$${fill.param}"`);
      }
      return { color: tint ? tintColor(color, tint) : color };
    }
    if (fill.color && tint) return { ...fill, color: tintColor(fill.color, tint) };
    return fill;
  };

  const build = (part: PartSpec): SceneNode => {
    const layer = (options.layerBase ?? 0) + (part.z ?? order++);
    return {
      id: `${options.idPrefix}/${part.id}`,
      layer,
      transform: partTransform(
        part.at ?? vec2(0, 0),
        part.pivot ?? vec2(0, 0),
        part.rotate ?? 0,
        part.scale ?? 1,
      ),
      shape: part.shape,
      fill: resolveFill(part.fill, part.id),
      stroke:
        part.stroke && tint
          ? { ...part.stroke, color: tintColor(part.stroke.color, tint) }
          : part.stroke,
      children: part.children?.map(build),
    };
  };

  const root: SceneNode = {
    id: options.idPrefix,
    transform: scaling((options.flip ? -1 : 1) * (options.scale ?? 1), options.scale ?? 1),
    children: spec.parts.map(build),
  };
  return root;
}

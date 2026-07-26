/**
 * Scene graph and 2.5D painter sort. A scene is a tree of nodes; each node
 * has a local transform and may carry a shape and/or children. Depth is a
 * band in [0,1] — 0 nearest, 1 farthest — and drives draw order (far drawn
 * first), with `layer` and screen-y as tiebreakers inside a band.
 */

import type { Color } from './color.js';
import { apply, compose, IDENTITY, type Transform, type Vec2 } from './math.js';

export interface Fill {
  readonly color: Color;
}

export interface Stroke {
  readonly color: Color;
  readonly width: number;
}

export type Shape =
  | { readonly kind: 'rect'; readonly width: number; readonly height: number; readonly rx?: number }
  | { readonly kind: 'circle'; readonly r: number }
  | { readonly kind: 'ellipse'; readonly rx: number; readonly ry: number }
  | { readonly kind: 'polygon'; readonly points: readonly Vec2[] }
  | { readonly kind: 'path'; readonly d: string };

export interface SceneNode {
  readonly id: string;
  readonly transform?: Transform;
  /** Depth band 0 (nearest) … 1 (farthest). Inherited when omitted. */
  readonly depth?: number;
  /** Draw-order tiebreaker inside a depth band; higher = on top. Inherited. */
  readonly layer?: number;
  readonly opacity?: number;
  readonly fill?: Fill;
  readonly stroke?: Stroke;
  readonly shape?: Shape;
  readonly children?: readonly SceneNode[];
}

export interface DrawItem {
  readonly id: string;
  readonly worldTransform: Transform;
  readonly depth: number;
  readonly layer: number;
  readonly opacity: number;
  readonly fill?: Fill;
  readonly stroke?: Stroke;
  readonly shape: Shape;
  /** World-space position of the node origin — the screen-y sort key. */
  readonly anchor: Vec2;
}

/**
 * Flatten a scene tree into draw items with composed world transforms.
 * Depth/layer/opacity inherit down the tree (opacity multiplies).
 */
export function flattenScene(root: SceneNode): DrawItem[] {
  const items: DrawItem[] = [];
  const seen = new Set<string>();

  const walk = (
    node: SceneNode,
    parentTransform: Transform,
    depth: number,
    layer: number,
    opacity: number,
  ): void => {
    if (seen.has(node.id)) throw new Error(`Duplicate node id: ${JSON.stringify(node.id)}`);
    seen.add(node.id);
    const world = compose(parentTransform, node.transform ?? IDENTITY);
    const d = node.depth ?? depth;
    const l = node.layer ?? layer;
    const o = opacity * (node.opacity ?? 1);
    if (d < 0 || d > 1) throw new Error(`Node ${node.id}: depth ${d} outside [0,1]`);
    if (node.shape) {
      items.push({
        id: node.id,
        worldTransform: world,
        depth: d,
        layer: l,
        opacity: o,
        fill: node.fill,
        stroke: node.stroke,
        shape: node.shape,
        anchor: apply(world, { x: 0, y: 0 }),
      });
    }
    for (const child of node.children ?? []) walk(child, world, d, l, o);
  };

  walk(root, IDENTITY, 0.5, 0, 1);
  return items;
}

/** Depth quantized to bands so float noise can't flip draw order. */
export const depthBand = (depth: number): number => Math.round(depth * 1000);

/**
 * Painter's algorithm order: farthest band first; within a band, lower
 * layers first; then smaller screen-y (higher on screen) first, so items
 * lower on screen paint over items behind them. Ties keep input order
 * (stable sort), which is itself deterministic scene order.
 */
export function painterSort(items: readonly DrawItem[]): DrawItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const band = depthBand(b.item.depth) - depthBand(a.item.depth);
      if (band !== 0) return band;
      if (a.item.layer !== b.item.layer) return a.item.layer - b.item.layer;
      if (a.item.anchor.y !== b.item.anchor.y) return a.item.anchor.y - b.item.anchor.y;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

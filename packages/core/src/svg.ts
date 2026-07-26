/**
 * Deterministic SVG emitter — the frame IR serializer (ADR-0001). Rules
 * that make output byte-stable:
 *
 * - numbers formatted at fixed precision, trailing zeros trimmed, `-0`
 *   normalized to `0`;
 * - attributes emitted in sorted order within every element;
 * - `<defs>` (gradients) deduplicated by content and numbered in first-use
 *   order.
 */

import { formatColor } from './color.js';
import { IDENTITY, type Transform } from './math.js';
import type { DrawItem, LinearGradient, Shape } from './scene.js';

export interface SvgOptions {
  readonly width: number;
  readonly height: number;
  /** Decimal places for coordinates; default 3. */
  readonly precision?: number;
  /** Optional background fill (emitted as a first full-viewport rect). */
  readonly background?: string;
}

/** Fixed-precision, canonical number formatting. */
export function fmtNumber(n: number, precision = 3): string {
  if (!Number.isFinite(n)) throw new Error(`Non-finite number in SVG output: ${n}`);
  const s = n.toFixed(precision);
  const trimmed = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  return trimmed === '-0' ? '0' : trimmed;
}

const attrsToString = (attrs: Record<string, string | undefined>): string =>
  Object.keys(attrs)
    .sort()
    .filter((k) => attrs[k] !== undefined)
    .map((k) => ` ${k}="${attrs[k]}"`)
    .join('');

const isIdentity = (m: Transform): boolean =>
  m.a === IDENTITY.a &&
  m.b === IDENTITY.b &&
  m.c === IDENTITY.c &&
  m.d === IDENTITY.d &&
  m.e === IDENTITY.e &&
  m.f === IDENTITY.f;

function shapeElement(shape: Shape, attrs: Record<string, string | undefined>, p: number): string {
  const f = (n: number) => fmtNumber(n, p);
  switch (shape.kind) {
    case 'rect':
      // Centered on the node origin, like circle/ellipse — `at:` means center.
      return `<rect${attrsToString({
        ...attrs,
        x: f(-shape.width / 2),
        y: f(-shape.height / 2),
        width: f(shape.width),
        height: f(shape.height),
        ...(shape.rx !== undefined ? { rx: f(shape.rx) } : {}),
      })}/>`;
    case 'circle':
      return `<circle${attrsToString({ ...attrs, r: f(shape.r) })}/>`;
    case 'ellipse':
      return `<ellipse${attrsToString({ ...attrs, rx: f(shape.rx), ry: f(shape.ry) })}/>`;
    case 'polygon':
      return `<polygon${attrsToString({
        ...attrs,
        points: shape.points.map((pt) => `${f(pt.x)},${f(pt.y)}`).join(' '),
      })}/>`;
    case 'path':
      return `<path${attrsToString({ ...attrs, d: shape.d })}/>`;
  }
}

const gradientKey = (g: LinearGradient, p: number): string =>
  JSON.stringify([
    fmtNumber(g.from.x, p),
    fmtNumber(g.from.y, p),
    fmtNumber(g.to.x, p),
    fmtNumber(g.to.y, p),
    g.stops.map((s) => [fmtNumber(s.offset, 6), formatColor(s.color)]),
  ]);

/**
 * Serialize painter-sorted draw items into a complete SVG document.
 * Same items in → same bytes out, always.
 */
export function emitSvg(items: readonly DrawItem[], options: SvgOptions): string {
  const p = options.precision ?? 3;
  const f = (n: number) => fmtNumber(n, p);

  const defs = new Map<string, { id: string; markup: string }>();
  const gradientId = (g: LinearGradient): string => {
    const key = gradientKey(g, p);
    let entry = defs.get(key);
    if (!entry) {
      const id = `g${defs.size}`;
      const stops = g.stops
        .map(
          (s) =>
            `<stop${attrsToString({ offset: fmtNumber(s.offset, 6), 'stop-color': formatColor(s.color) })}/>`,
        )
        .join('');
      entry = {
        id,
        markup: `<linearGradient${attrsToString({
          id,
          gradientUnits: 'userSpaceOnUse',
          x1: f(g.from.x),
          y1: f(g.from.y),
          x2: f(g.to.x),
          y2: f(g.to.y),
        })}>${stops}</linearGradient>`,
      };
      defs.set(key, entry);
    }
    return entry.id;
  };

  const body = items.map((item) => {
    const attrs: Record<string, string | undefined> = {};
    if (!isIdentity(item.worldTransform)) {
      const m = item.worldTransform;
      attrs.transform = `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(f).join(' ')})`;
    }
    if (item.fill?.gradient) attrs.fill = `url(#${gradientId(item.fill.gradient)})`;
    else if (item.fill?.color) attrs.fill = formatColor(item.fill.color);
    else attrs.fill = 'none';
    if (item.stroke) {
      attrs.stroke = formatColor(item.stroke.color);
      attrs['stroke-width'] = f(item.stroke.width);
    }
    if (item.opacity < 1) attrs.opacity = fmtNumber(item.opacity, 4);
    return shapeElement(item.shape, attrs, p);
  });

  const defsMarkup = defs.size
    ? `<defs>${[...defs.values()].map((d) => d.markup).join('')}</defs>`
    : '';
  const background =
    options.background === undefined
      ? ''
      : `<rect${attrsToString({ width: f(options.width), height: f(options.height), fill: options.background })}/>`;

  return [
    `<svg${attrsToString({
      xmlns: 'http://www.w3.org/2000/svg',
      width: f(options.width),
      height: f(options.height),
      viewBox: `0 0 ${f(options.width)} ${f(options.height)}`,
    })}>`,
    defsMarkup,
    background,
    ...body,
    '</svg>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

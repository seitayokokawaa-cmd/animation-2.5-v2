/**
 * Rasterizer interface (ADR-0001). The engine talks to this interface only;
 * resvg is the default backend, swappable without touching anything else.
 */

import { Resvg } from '@resvg/resvg-js';

export interface Rasterizer {
  /** SVG document → PNG bytes. Must be deterministic. */
  readonly toPng: (svg: string) => Uint8Array;
  readonly name: string;
}

export const resvgRasterizer: Rasterizer = {
  name: '@resvg/resvg-js',
  toPng: (svg) => new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng(),
};

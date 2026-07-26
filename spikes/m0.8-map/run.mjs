// Spike M0.8: Natural Earth Europe 110m → simplified stylized SVG map;
// recolor one region; morph one border. Proves the map-engine bets:
// GeoJSON → paths, Douglas–Peucker simplification, equirectangular
// projection, per-region recolor, and path-resample border morphing.
// Run with: node spikes/m0.8-map/run.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
const goldenDir = join(here, 'golden');
mkdirSync(outDir, { recursive: true });
mkdirSync(goldenDir, { recursive: true });

const geo = JSON.parse(
  readFileSync(join(here, '../../assets/geodata/ne_110m_europe.json'), 'utf8'),
);

// ---- projection: equirectangular over a Europe viewport ----------------
const VIEW = { lonMin: -12, lonMax: 42, latMin: 34, latMax: 62 };
const W = 1280;
const H = 960;
const project = ([lon, lat]) => [
  ((lon - VIEW.lonMin) / (VIEW.lonMax - VIEW.lonMin)) * W,
  ((VIEW.latMax - lat) / (VIEW.latMax - VIEW.latMin)) * H,
];

// ---- Douglas–Peucker simplification ------------------------------------
function dpSimplify(points, tolerance) {
  if (points.length < 3) return points;
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let maxD = 0;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const ex = px - (ax + t * dx);
      const ey = py - (ay + t * dy);
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > sqTol) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ---- geometry → projected, simplified rings ----------------------------
const TOL = 1.5; // px
function rings(geometry) {
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  const out = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const projected = ring.map(project);
      const simplified = dpSimplify(projected, TOL);
      if (simplified.length >= 4) out.push(simplified);
    }
  }
  return out;
}

const fmt = (n) => n.toFixed(2);
const ringPath = (ring) => `M${ring.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;

// ---- paper style --------------------------------------------------------
const PAPER = {
  sea: '#cfdbd5',
  land: '#efe6d0',
  coast: '#9b8f76',
  highlightA: '#b5453c',
  highlightB: '#3c6fb5',
};

function mapSvg(recolors = new Map(), extra = '') {
  const shapes = geo.features
    .map((f) => {
      const d = rings(f.geometry).map(ringPath).join('');
      if (!d) return '';
      const fill = recolors.get(f.properties.id) ?? PAPER.land;
      return `<path id="${f.properties.id}" d="${d}" fill="${fill}" stroke="${PAPER.coast}" stroke-width="1.2" stroke-linejoin="round"/>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${PAPER.sea}"/>
${shapes}
${extra}
</svg>`;
}

const png = (svg) => new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();

// 1) Base stylized map.
writeFileSync(join(outDir, 'europe.svg'), mapSvg());
writeFileSync(join(goldenDir, 'europe.png'), png(mapSvg()));

// 2) Recolor one region (germany red, france blue — alliance-style).
const recolored = mapSvg(
  new Map([
    ['germany', PAPER.highlightA],
    ['france', PAPER.highlightB],
  ]),
);
writeFileSync(join(outDir, 'europe-recolor.svg'), recolored);
writeFileSync(join(goldenDir, 'europe-recolor.png'), png(recolored));

// 3) Border morph: resample two closed paths to N points and interpolate.
// Morph Germany's main outline into a genre-appropriate blob ("wartime
// gains"), the mechanism M7.3 uses for territory-change morphs.
function resampleClosed(ring, n) {
  const pts = ring.slice();
  const segLens = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const l = Math.hypot(bx - ax, by - ay);
    segLens.push(l);
    total += l;
  }
  const out = [];
  let target = 0;
  const step = total / n;
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    while (acc + segLens[seg] < target) {
      acc += segLens[seg];
      seg = (seg + 1) % pts.length;
    }
    const t = (target - acc) / (segLens[seg] || 1e-12);
    const [ax, ay] = pts[seg];
    const [bx, by] = pts[(seg + 1) % pts.length];
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    target += step;
  }
  return out;
}

const germany = geo.features.find((f) => f.properties.id === 'germany');
const gRings = rings(germany.geometry);
const main = gRings.reduce((a, b) => (b.length > a.length ? b : a));
const N = 128;
const from = resampleClosed(main, N);
// Target blob: germany's centroid inflated into a wobbly circle.
const cx = from.reduce((s, p) => s + p[0], 0) / N;
const cy = from.reduce((s, p) => s + p[1], 0) / N;
const to = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2;
  const r = 150 + 22 * Math.sin(a * 5);
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
// Align start points to minimize twist: rotate `to` so its first point is
// nearest `from[0]`.
let best = 0;
let bestD = Infinity;
for (let i = 0; i < N; i++) {
  const d = Math.hypot(to[i][0] - from[0][0], to[i][1] - from[0][1]);
  if (d < bestD) {
    bestD = d;
    best = i;
  }
}
const toAligned = to.slice(best).concat(to.slice(0, best));

const lerpRing = (t) =>
  from.map(([x, y], i) => [x + (toAligned[i][0] - x) * t, y + (toAligned[i][1] - y) * t]);

for (const t of [0, 0.5, 1]) {
  const morphPath = `<path d="${ringPath(lerpRing(t))}" fill="${PAPER.highlightA}" fill-opacity="0.85" stroke="#7d2f28" stroke-width="2"/>`;
  const svg = mapSvg(new Map(), morphPath);
  writeFileSync(join(outDir, `morph-${t}.svg`), svg);
  if (t === 0.5) writeFileSync(join(goldenDir, 'morph-mid.png'), png(svg));
}

// Report: feature/point counts before and after simplification.
let rawPts = 0;
let simpPts = 0;
for (const f of geo.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) rawPts += ring.length;
  for (const ring of rings(f.geometry)) simpPts += ring.length;
}
const report = [
  `features: ${geo.features.length}`,
  `points: ${rawPts} raw → ${simpPts} after DP(tol=${TOL}px)`,
  `morph: germany main ring (${main.length} pts) resampled to ${N}, interpolated 0 → 0.5 → 1`,
  `outputs: out/europe*.svg, out/morph-*.svg, golden/*.png`,
].join('\n');
console.log(report);
writeFileSync(join(outDir, 'report.txt'), report + '\n');

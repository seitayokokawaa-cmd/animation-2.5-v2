// Spike M0.4: can @resvg/resvg-js rasterize our SVG frame IR at 1080p, how
// fast, and byte-deterministically? Run with: node spikes/m0.4-resvg/run.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(outDir, { recursive: true });

// A frame representative of our target complexity: sky gradient, parallax
// hills, a building, a tree, a cart with spoked wheels, and a simple figure —
// a few hundred vector elements.
function frameSvg(t) {
  const wheelAngle = t * 60;
  const cartX = 200 + t * 300;
  const parts = [];
  parts.push(`<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd9a0"/><stop offset="1" stop-color="#87b7d4"/>
    </linearGradient>
  </defs>`);
  parts.push('<rect width="1920" height="1080" fill="url(#sky)"/>');
  for (let i = 0; i < 8; i++) {
    const x = ((i * 331 - t * 20) % 2200) - 140;
    parts.push(
      `<ellipse cx="${x.toFixed(3)}" cy="${(760 + (i % 3) * 40).toFixed(3)}" rx="260" ry="90" fill="#7a9e6e" opacity="0.8"/>`,
    );
  }
  parts.push('<rect y="860" width="1920" height="220" fill="#5f7d52"/>');
  parts.push('<rect x="1300" y="560" width="360" height="300" fill="#e8d8b0"/>');
  parts.push('<polygon points="1280,560 1480,430 1680,560" fill="#8a3324"/>');
  parts.push('<rect x="1430" y="720" width="90" height="140" fill="#6b4a2b"/>');
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    parts.push(
      `<circle cx="${(400 + Math.cos(a) * 90).toFixed(3)}" cy="${(500 + Math.sin(a) * 90).toFixed(3)}" r="26" fill="#3c6b3a"/>`,
    );
  }
  parts.push('<rect x="384" y="580" width="32" height="280" fill="#6b4a2b"/>');
  for (const wx of [0, 140]) {
    parts.push(`<g transform="translate(${(cartX + wx).toFixed(3)} 830) rotate(${wheelAngle.toFixed(3)})">
      <circle r="46" fill="none" stroke="#4a3320" stroke-width="10"/>
      ${[0, 45, 90, 135]
        .map(
          (s) =>
            `<rect x="-42" y="-4" width="84" height="8" fill="#4a3320" transform="rotate(${s})"/>`,
        )
        .join('')}
    </g>`);
  }
  parts.push(
    `<rect x="${(cartX - 40).toFixed(3)}" y="740" width="220" height="50" fill="#8a6a3f"/>`,
  );
  parts.push(
    `<g transform="translate(${(cartX - 120).toFixed(3)} 700)">
      <circle cy="-60" r="24" fill="#c68642"/>
      <rect x="-14" y="-36" width="28" height="80" rx="10" fill="#d94f30"/>
      <rect x="-12" y="44" width="10" height="80" fill="#7a4a20"/>
      <rect x="2" y="44" width="10" height="80" fill="#7a4a20"/>
    </g>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${parts.join('\n')}</svg>`;
}

const render = (svg) =>
  new Resvg(svg, {
    fitTo: { mode: 'width', value: 1920 },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();

// Warm-up, then timed frames.
render(frameSvg(0));
const N = 30;
const times = [];
let lastPng;
for (let i = 0; i < N; i++) {
  const svg = frameSvg(i / 30);
  const t0 = process.hrtime.bigint();
  lastPng = render(svg);
  times.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
times.sort((a, b) => a - b);
const mean = times.reduce((s, x) => s + x, 0) / N;

// Determinism: same SVG rendered twice must produce identical PNG bytes.
const sha = (b) => createHash('sha256').update(b).digest('hex');
const svgFixed = frameSvg(0.5);
const h1 = sha(render(svgFixed));
const h2 = sha(render(svgFixed));

writeFileSync(join(outDir, 'frame.png'), lastPng);
console.log(`resvg-js versions: ${JSON.stringify(process.versions)}`);
console.log(`frames: ${N} @ 1920x1080`);
console.log(
  `ms/frame  mean=${mean.toFixed(2)}  median=${times[N >> 1].toFixed(2)}  min=${times[0].toFixed(2)}  max=${times[N - 1].toFixed(2)}`,
);
console.log(`double-render sha256 equal: ${h1 === h2} (${h1.slice(0, 16)}…)`);

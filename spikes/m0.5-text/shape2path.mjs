// Spike M0.5b — the chosen text architecture: shape with HarfBuzz (WASM),
// emit glyph outlines as SVG <path>s, rasterize with resvg. resvg never sees
// <text>, so its Bengali layout defects (see RESULTS.md) are bypassed while
// SVG remains the complete frame IR.
// Run: node spikes/m0.5-text/shape2path.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import { Blob, Buffer as HbBuffer, Face, Font, shape } from 'harfbuzzjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const goldenDir = join(here, 'golden');
mkdirSync(goldenDir, { recursive: true });

function shapeLine(fontPath, text) {
  const blob = new Blob(readFileSync(fontPath));
  const face = new Face(blob);
  const font = new Font(face);
  const buffer = new HbBuffer();
  buffer.addText(text);
  buffer.guessSegmentProperties(); // resolves script + RTL for Arabic
  shape(font, buffer);
  const glyphs = buffer.getGlyphInfosAndPositions();
  const paths = [];
  let penX = 0;
  for (const g of glyphs) {
    const d = font.glyphToPath(g.codepoint);
    if (d && d.length > 0) paths.push({ d, x: penX + (g.xOffset ?? 0), y: g.yOffset ?? 0 });
    penX += g.xAdvance ?? 0;
  }
  // harfbuzzjs frees native objects via FinalizationRegistry — no manual destroy.
  return { paths, upem: face.upem, width: penX };
}

const lines = [
  { font: 'NotoSansBengali-Regular.ttf', text: 'কি বিড়াল খেলে · রুটি চোর' },
  { font: 'NotoSansBengali-Regular.ttf', text: 'ক্ষ ষ্ণ ক্ত ন্ধ হ্ম জ্ঞ' },
  { font: 'NotoNaskhArabic-Regular.ttf', text: 'السلام عليكم ورحمة الله' },
  { font: 'NotoSansSC-Regular.ttf', text: '狐狸偷面包，动画编译器' },
];

const rows = [];
let y = 130;
for (const l of lines) {
  const { paths, upem, width } = shapeLine(join(repo, 'assets/fonts', l.font), l.text);
  const s = 72 / upem;
  rows.push(
    paths
      .map(
        (p) =>
          `<path fill="#111" d="${p.d}" transform="translate(${(60 + p.x * s).toFixed(3)} ${(y - p.y * s).toFixed(3)}) scale(${s.toFixed(6)} ${(-s).toFixed(6)})"/>`,
      )
      .join('\n'),
  );
  console.log(
    `${l.text.slice(0, 12)}…  ${paths.length} glyph paths, advance ${(width * s).toFixed(1)}px`,
  );
  y += 110;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${y - 40}">
<rect width="100%" height="100%" fill="#f7f2e8"/>
${rows.join('\n')}
</svg>`;

const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
writeFileSync(join(goldenDir, 'shaped-paths.png'), png);
console.log('wrote golden/shaped-paths.png');

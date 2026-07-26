// Spike M0.5: does resvg (rustybuzz shaping) handle complex scripts with our
// bundled Noto fonts? Bengali conjuncts + matra reordering, Arabic joining +
// RTL + bidi, CJK. Run: node spikes/m0.5-text/run.mjs
// Golden PNGs are written to golden/ and committed for eyeball review.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const goldenDir = join(here, 'golden');
mkdirSync(goldenDir, { recursive: true });

const fontFiles = [
  join(repo, 'assets/fonts/NotoSans-Regular.ttf'),
  join(repo, 'assets/fonts/NotoSansBengali-Regular.ttf'),
  join(repo, 'assets/fonts/NotoNaskhArabic-Regular.ttf'),
  join(repo, 'assets/fonts/NotoSansSC-Regular.ttf'),
];
const families = "'Noto Sans','Noto Sans Bengali','Noto Naskh Arabic','Noto Sans SC'";

const cases = [
  {
    name: 'bengali-conjuncts',
    lines: [
      'ক্ষ ষ্ণ ক্ত ন্ধ হ্ম জ্ঞ', // conjunct ligatures — must NOT show a visible virama chain
      'কি বিড়াল খেলে', // i-matra must render to the LEFT of its consonant
      'রুটি চোর', // the film title from PLAN.md §4
    ],
  },
  {
    name: 'arabic-rtl',
    lines: [
      'السلام عليكم ورحمة الله', // cursive joining across each word
      'محرك أفلام حتمي', // "deterministic film engine"
    ],
  },
  {
    name: 'cjk',
    lines: ['狐狸偷面包', '动画编译器：一个剧本，一部电影'],
  },
  {
    name: 'bidi-mixed',
    lines: [
      'Fox said مرحبا and ran 42 m', // LTR base with embedded RTL run
      'الفصل 3: MotionForge يعمل بدقة', // RTL base with embedded Latin + digits
    ],
  },
];

function caseSvg(lines) {
  const text = lines
    .map(
      (line, i) =>
        `<text x="60" y="${120 + i * 110}" font-size="72" font-family="${families}" fill="#111">${line}</text>`,
    )
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${lines.length * 110 + 80}">
<rect width="100%" height="100%" fill="#f7f2e8"/>
${text}
</svg>`;
}

const render = (svg) =>
  new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Noto Sans' },
  })
    .render()
    .asPng();

const sha = (b) => createHash('sha256').update(b).digest('hex');

for (const c of cases) {
  const svg = caseSvg(c.lines);
  const png = render(svg);
  const again = render(svg);
  writeFileSync(join(goldenDir, `${c.name}.png`), png);
  console.log(
    `${c.name}: ${png.length} bytes, double-render identical: ${sha(png) === sha(again)}`,
  );
}
console.log('done — eyeball golden/*.png');

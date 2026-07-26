// Spike M0.6: 60 generated frames → ffmpeg (ffmpeg-static) with bitexact
// flags → MP4, rendered twice; the two files must be byte-identical.
// Run with: node spikes/m0.6-encode/run.mjs
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import ffmpegPath from 'ffmpeg-static';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(outDir, { recursive: true });

const W = 1920;
const H = 1080;
const FPS = 30;
const FRAMES = 60;

// The v1 M0 exit criterion frame: a moving rectangle (plus a gradient sky so
// the encoder sees non-trivial content).
function frameSvg(n) {
  const x = 100 + (n / FRAMES) * 1400;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#2b3a55"/><stop offset="1" stop-color="#6e8aa8"/>
</linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect x="${x.toFixed(3)}" y="440" width="320" height="200" rx="24" fill="#d94f30"/>
</svg>`;
}

function rasterize(n) {
  return new Resvg(frameSvg(n), {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
}

// Encode by piping PNG frames into ffmpeg's stdin (image2pipe), exactly the
// shape the real render service will use. All bitexact + no-metadata flags on.
function encode(outFile, pngs) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(FPS),
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-fflags',
      '+bitexact',
      '-flags:v',
      '+bitexact',
      '-map_metadata',
      '-1',
      '-movflags',
      '+faststart',
      outFile,
    ];
    const ff = spawn(ffmpegPath, args, { stdio: ['pipe', 'inherit', 'inherit'] });
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    for (const png of pngs) ff.stdin.write(png);
    ff.stdin.end();
  });
}

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

const t0 = process.hrtime.bigint();
const pngs = [];
for (let n = 0; n < FRAMES; n++) pngs.push(rasterize(n));
const rasterMs = Number(process.hrtime.bigint() - t0) / 1e6;

const a = join(outDir, 'render-a.mp4');
const b = join(outDir, 'render-b.mp4');
const t1 = process.hrtime.bigint();
await encode(a, pngs);
const encodeMs = Number(process.hrtime.bigint() - t1) / 1e6;
await encode(b, pngs);

const ha = sha(a);
const hb = sha(b);
const report = [
  `ffmpeg: ${ffmpegPath}`,
  `frames: ${FRAMES} @ ${W}x${H} ${FPS}fps`,
  `rasterize total: ${rasterMs.toFixed(0)} ms (${(rasterMs / FRAMES).toFixed(1)} ms/frame)`,
  `encode total:    ${encodeMs.toFixed(0)} ms`,
  `render-a sha256: ${ha}`,
  `render-b sha256: ${hb}`,
  `byte-identical:  ${ha === hb}`,
].join('\n');
console.log(report);
writeFileSync(join(outDir, 'report.txt'), report + '\n');
if (ha !== hb) {
  process.exitCode = 1;
  console.error('FAIL: encode is not byte-stable');
}

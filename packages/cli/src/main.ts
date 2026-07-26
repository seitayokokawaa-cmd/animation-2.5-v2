/**
 * The `mf` CLI. v0 commands: check, render, frame (M2.6/M2.7).
 * Run via `pnpm mf <command> ...` (tsx).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { secondsToTicks } from '@motionforge/core';
import {
  check,
  compileWithMarkers,
  hasErrors,
  printJson,
  printPretty,
  timingTable,
  type MfsDocument,
  type VoiceData,
} from '@motionforge/lang';
import { buildFrameSvg, renderFilm, resvgRasterizer } from '@motionforge/render';
import {
  adapterFor,
  energyAligner,
  readLock,
  syncSegments,
  VoiceCache,
  writeLock,
  type SegmentRequest,
} from '@motionforge/voice';

const USAGE = `MotionForge — deterministic 2.5D animation compiler

Usage:
  mf check <film.mfs.yaml> [--json]
  mf render <film.mfs.yaml> [-o out.mp4]
  mf frame <film.mfs.yaml> --at <seconds> [-o out.png|out.svg]
  mf voice sync <film.mfs.yaml> [--cache-dir assets/voice]
  mf timing <film.mfs.yaml>
`;

/** The film's lock file sits beside it: film.mfs.yaml → film.voice.lock.json */
export const lockPathFor = (file: string): string =>
  file.replace(/\.mfs\.yaml$/, '') + '.voice.lock.json';

/** Collect every narration segment as a cache request (key = sceneId/index). */
function segmentRequests(doc: MfsDocument): SegmentRequest[] {
  const requests: SegmentRequest[] = [];
  for (const scene of doc.scenes) {
    scene.narration.forEach((segment, index) => {
      const spec = doc.voices[segment.voice];
      if (!spec) {
        fail(
          `Scene "${scene.id}" narration uses unknown voice "${segment.voice}" — declare it under voices:`,
        );
      }
      requests.push({ key: `${scene.id}/${index}`, text: segment.text, spec });
    });
  }
  return requests;
}

/** Frozen narration lookup for the compiler, from lock + cache. */
function voiceDataFor(file: string, cacheDir: string): VoiceData {
  const lock = readLock(lockPathFor(file));
  const cache = new VoiceCache(cacheDir);
  return {
    segment(key) {
      const entry = lock.segments[key];
      if (!entry) return undefined;
      if (!cache.hasWav(entry.hash)) return undefined;
      const words = cache.hasAlign(entry.hash) ? cache.readAlign(entry.hash).words : [];
      return { hash: entry.hash, durationSeconds: entry.durationSeconds, words };
    },
  };
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Validate; print findings; exit(1) on errors. Returns the typed doc. */
function loadChecked(file: string, json: boolean) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    fail(`Cannot read ${file}`);
  }
  const result = check(text, file);
  if (result.findings.length > 0) {
    process.stdout.write((json ? printJson(result.findings) : printPretty(result.findings)) + '\n');
  }
  if (hasErrors(result.findings) || !result.doc) process.exit(1);
  return result.doc;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(USAGE);
    return;
  }

  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      out: { type: 'string', short: 'o' },
      at: { type: 'string' },
      'cache-dir': { type: 'string', default: 'assets/voice' },
    },
  });
  const file = command === 'voice' ? positionals[1] : positionals[0];
  if (!file) fail(USAGE);

  switch (command) {
    case 'voice': {
      if (positionals[0] !== 'sync') fail(USAGE);
      const doc = loadChecked(file, values.json);
      const requests = segmentRequests(doc);
      const cache = new VoiceCache(values['cache-dir']);
      const result = await syncSegments(requests, cache, adapterFor, energyAligner);
      const lockPath = lockPathFor(file);
      writeLock(lockPath, result.lock);
      process.stderr.write(
        `voice sync: ${result.synthesized.length} synthesized, ${result.reused.length} cached → ${lockPath}\n`,
      );
      return;
    }
    case 'check': {
      const doc = loadChecked(file, values.json);
      if (!values.json) process.stdout.write(`OK: ${doc.meta.title}\n`);
      return;
    }
    case 'render': {
      const doc = loadChecked(file, values.json);
      const { film } = compileWithMarkers(doc, voiceDataFor(file, values['cache-dir']));
      const out = values.out ?? file.replace(/\.mfs\.yaml$/, '') + '.mp4';
      const started = performance.now();
      const { frames } = await renderFilm(film, out, {
        onFrame: (n, total) => {
          if (n % 30 === 0 || n === total) {
            process.stderr.write(`\rframe ${n}/${total}`);
          }
        },
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      process.stderr.write(`\rrendered ${frames} frames → ${out} in ${seconds}s\n`);
      return;
    }
    case 'frame': {
      const doc = loadChecked(file, values.json);
      if (values.at === undefined) fail('frame: --at <seconds> is required');
      const seconds = Number(values.at);
      if (!Number.isFinite(seconds) || seconds < 0) fail(`frame: invalid --at ${values.at}`);
      const { film } = compileWithMarkers(doc, voiceDataFor(file, values['cache-dir']));
      const svg = buildFrameSvg(film, secondsToTicks(seconds));
      const out = values.out ?? file.replace(/\.mfs\.yaml$/, '') + `-t${values.at}.png`;
      if (out.endsWith('.svg')) {
        writeFileSync(out, svg);
      } else {
        writeFileSync(out, resvgRasterizer.toPng(svg));
      }
      process.stderr.write(`wrote ${out}\n`);
      return;
    }
    case 'timing': {
      const doc = loadChecked(file, values.json);
      const { markers } = compileWithMarkers(doc, voiceDataFor(file, values['cache-dir']));
      process.stdout.write(timingTable(markers) + '\n');
      return;
    }
    default:
      fail(USAGE);
  }
}

await main();

/**
 * The `mf` CLI. v0 commands: check, render, frame (M2.6/M2.7).
 * Run via `pnpm mf <command> ...` (tsx).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { secondsToTicks } from '@motionforge/core';
import {
  check,
  checkStructure,
  compileWithMarkers,
  loadLibraries,
  hasErrors,
  printJson,
  printPretty,
  timingTable,
  type MfsDocument,
  type MapsData,
  type NarrationCacheProbe,
  type VerbClaims,
  type VoiceData,
} from '@motionforge/lang';
import { VERB_REGISTRY } from '@motionforge/motion';
import {
  applyCustomRegions,
  compileMap,
  EUROPE_VIEW,
  mapObjectSpec,
  validateGroups,
  WORLD_VIEW,
  type GeoCollection,
} from '@motionforge/maps';
import { buildFrameSvg, renderFilm, resvgRasterizer } from '@motionforge/render';

import {
  anthropicAdapter,
  authorFilm,
  MockLlmAdapter,
  type AuthorTools,
  type LlmAdapter,
} from '@motionforge/agent';

import { GEODATA_SOURCES, GEODATA_TOLERANCE_DEGREES } from './geodata.js';
import { buildSpec } from './spec.js';
import {
  adapterFor,
  energyAligner,
  isStale,
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
  mf spec [-o docs/SPEC.md]
  mf author "<topic>" [-o out/film.mp4] [--research] [--mock transcript.json]

Exit codes: 0 = clean (warnings allowed), 1 = error findings, 2 = usage/IO failure.
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
    // Character lines (M8.4) freeze through the same cache.
    scene.lines.forEach((line, index) => {
      const voiceName = line.voice ?? line.speaker;
      const spec = doc.voices[voiceName];
      if (!spec) {
        fail(
          `Scene "${scene.id}" line uses unknown voice "${voiceName}" — declare it under voices:`,
        );
      }
      requests.push({ key: `${scene.id}/line/${index}`, text: line.say, spec });
    });
  }
  return requests;
}

/** Stale/missing detection for the validator, from lock + cache. */
function cacheProbeFor(file: string, cacheDir: string): NarrationCacheProbe {
  const lock = readLock(lockPathFor(file));
  const cache = new VoiceCache(cacheDir);
  return {
    probe(key, spec, text) {
      const entry = lock.segments[key];
      if (!entry || !cache.hasWav(entry.hash)) return 'missing';
      return isStale(entry, { ...spec, engine: spec.engine }, text) ? 'stale' : 'ok';
    },
  };
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

/** Usage/IO failure — exit 2 so fix loops can tell it from findings (1). */
function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

/** Compile every `maps:` entry once from vendored geodata (M7.2). */
function mapsDataFor(doc: MfsDocument): MapsData {
  const compiled = new Map<string, ReturnType<MapsData['map']>>();
  for (const [name, def] of Object.entries(doc.maps)) {
    const sourceFile = GEODATA_SOURCES[def.source];
    if (!sourceFile) fail(`Map "${name}": unknown source "${def.source}"`);
    const geo = JSON.parse(
      readFileSync(join('assets', 'geodata', sourceFile), 'utf8'),
    ) as GeoCollection;
    // No explicit view → frame the whole source (world map shows the world).
    const defaultView = def.source.startsWith('naturalearth/world') ? WORLD_VIEW : EUROPE_VIEW;
    const view = def.view
      ? {
          lonMin: def.view.lon[0],
          lonMax: def.view.lon[1],
          latMin: def.view.lat[0],
          latMax: def.view.lat[1],
        }
      : defaultView;
    const toleranceDegrees = GEODATA_TOLERANCE_DEGREES[def.source];
    let spec = compileMap(geo, {
      view,
      ...(def.width !== undefined ? { widthUnits: def.width } : {}),
      ...(toleranceDegrees !== undefined
        ? {
            simplifyTolerance: (toleranceDegrees / (view.lonMax - view.lonMin)) * (def.width ?? 16),
          }
        : {}),
    });
    spec = applyCustomRegions(
      spec,
      Object.fromEntries(
        Object.entries(def.regions).map(([id, r]) => [
          id,
          { points: r.points, replace: r.replace },
        ]),
      ),
    );
    try {
      validateGroups(spec, def.groups);
    } catch (error) {
      fail(`Map "${name}": ${(error as Error).message}`);
    }
    compiled.set(name, {
      objectSpec: mapObjectSpec(spec, def.style ?? 'paper'),
      regions: spec.regions.map(({ id, centroid, bbox }) => ({ id, centroid, bbox })),
      groups: def.groups,
    });
  }
  return { map: (name) => compiled.get(name) };
}

/** Validate; print findings; exit(1) on errors. Returns the typed doc. */
/** Exclusivity declarations from the motion registry (M12.1). */
function registryClaims(): VerbClaims {
  const claims: Record<string, { exclusive: string; defaultSeconds: number }> = {};
  for (const [name, def] of VERB_REGISTRY) {
    if (def.exclusive) {
      claims[name] = { exclusive: def.exclusive, defaultSeconds: def.defaultDurationSeconds };
    }
  }
  return claims;
}

function loadChecked(file: string, json: boolean, cacheDir?: string, alwaysPrint = false) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    fail(`Cannot read ${file}`);
  }
  // Two-phase: a structural parse discovers use: paths, then the full check
  // runs with library objects merged in.
  const pre = checkStructure(text, file);
  const libraries = pre.doc
    ? loadLibraries(pre.doc.use, { filmDir: dirname(file), builtinDir: join('assets', 'library') })
    : undefined;
  const result = check(text, file, {
    ...(cacheDir ? { cacheProbe: cacheProbeFor(file, cacheDir) } : {}),
    ...(libraries ? { libraries: libraries.objects } : {}),
    verbClaims: registryClaims(),
  });
  if (libraries && libraries.findings.length > 0) {
    process.stdout.write(
      (json ? printJson(libraries.findings, file) : printPretty(libraries.findings)) + '\n',
    );
    process.exit(1);
  }
  if (result.findings.length > 0 || (alwaysPrint && json)) {
    process.stdout.write(
      (json ? printJson(result.findings, file) : printPretty(result.findings)) + '\n',
    );
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
      research: { type: 'boolean', default: false },
      mock: { type: 'string' },
    },
  });
  if (command === 'spec') {
    const spec = buildSpec();
    if (values.out) {
      writeFileSync(values.out, spec);
      process.stderr.write(`wrote ${values.out}\n`);
    } else {
      process.stdout.write(spec);
    }
    return;
  }

  const file = command === 'voice' ? positionals[1] : positionals[0];
  if (!file) fail(USAGE);

  switch (command) {
    case 'voice': {
      if (positionals[0] !== 'sync') fail(USAGE);
      const doc = loadChecked(file, values.json);
      const requests = segmentRequests(doc);
      const cache = new VoiceCache(values['cache-dir']);
      const result = await syncSegments(
        requests,
        cache,
        (engine) => adapterFor(engine),
        energyAligner,
      );
      const lockPath = lockPathFor(file);
      writeLock(lockPath, result.lock);
      process.stderr.write(
        `voice sync: ${result.synthesized.length} synthesized, ${result.reused.length} cached → ${lockPath}\n`,
      );
      return;
    }
    case 'author': {
      // Two-pass authoring (M13.3): topic → script → direction → voice
      // sync → check-fix loop → render. Artifacts land beside the output.
      const topic = file;
      const out = values.out ?? 'out/authored.mp4';
      const mfsPath = out.replace(/\.mp4$/, '') + '.mfs.yaml';
      const artifactsDir = out.replace(/\.mp4$/, '') + '.author';
      mkdirSync(dirname(out), { recursive: true });
      mkdirSync(artifactsDir, { recursive: true });
      const adapter: LlmAdapter = values.mock
        ? new MockLlmAdapter(JSON.parse(readFileSync(values.mock, 'utf8')) as string[])
        : anthropicAdapter();
      const cacheDir = values['cache-dir'];
      const tools: AuthorTools = {
        check(yaml) {
          writeFileSync(mfsPath, yaml);
          const pre = checkStructure(yaml, mfsPath);
          const libraries = pre.doc
            ? loadLibraries(pre.doc.use, {
                filmDir: dirname(mfsPath),
                builtinDir: join('assets', 'library'),
              })
            : undefined;
          const result = check(yaml, mfsPath, {
            cacheProbe: cacheProbeFor(mfsPath, cacheDir),
            ...(libraries ? { libraries: libraries.objects } : {}),
            verbClaims: registryClaims(),
          });
          return [...(libraries?.findings ?? []), ...result.findings].map((f) => ({
            code: f.code,
            severity: f.severity,
            message: `${f.file}:${f.pos.line}:${f.pos.col} ${f.message}`,
            ...(f.hint ? { hint: f.hint } : {}),
          }));
        },
        async voiceSync(yaml) {
          writeFileSync(mfsPath, yaml);
          const pre = checkStructure(yaml, mfsPath);
          if (!pre.doc) return; // check() reports the structural findings
          const cache = new VoiceCache(cacheDir);
          const result = await syncSegments(
            segmentRequests(pre.doc),
            cache,
            (engine) => adapterFor(engine),
            energyAligner,
          );
          writeLock(lockPathFor(mfsPath), result.lock);
        },
        async render(yaml) {
          writeFileSync(mfsPath, yaml);
          const doc = loadChecked(mfsPath, values.json, cacheDir);
          const { film } = compileWithMarkers(
            doc,
            voiceDataFor(mfsPath, cacheDir),
            mapsDataFor(doc),
          );
          const cache = new VoiceCache(cacheDir);
          await renderFilm(film, out, { readVoiceWav: (hash) => cache.readWav(hash) });
          return out;
        },
        save(name, content) {
          writeFileSync(join(artifactsDir, name), content);
        },
      };
      const result = await authorFilm(adapter, tools, {
        topic,
        spec: buildSpec(),
        styleGuide: readFileSync(join('docs', 'style-guide.md'), 'utf8'),
        research: values.research,
      });
      process.stderr.write(
        `authored ${result.outPath} (${result.fixAttempts} fix pass(es), screenplay ${mfsPath})\n`,
      );
      return;
    }
    case 'check': {
      // Exit codes (M12.6): 0 = no errors (warnings allowed), 1 = errors
      // or an uncompilable document, 2 = usage/IO failure. `--json` always
      // prints the machine envelope, clean or not.
      const doc = loadChecked(file, values.json, values['cache-dir'], true);
      if (!values.json) process.stdout.write(`OK: ${doc.meta.title}\n`);
      return;
    }
    case 'render': {
      const doc = loadChecked(file, values.json, values['cache-dir']);
      const { film } = compileWithMarkers(
        doc,
        voiceDataFor(file, values['cache-dir']),
        mapsDataFor(doc),
      );
      const out = values.out ?? file.replace(/\.mfs\.yaml$/, '') + '.mp4';
      const started = performance.now();
      const cache = new VoiceCache(values['cache-dir']);
      const { frames, narrationSegments } = await renderFilm(film, out, {
        readVoiceWav: (hash) => cache.readWav(hash),
        onFrame: (n, total) => {
          if (n % 30 === 0 || n === total) {
            process.stderr.write(`\rframe ${n}/${total}`);
          }
        },
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      process.stderr.write(
        `\rrendered ${frames} frames${narrationSegments ? ` + ${narrationSegments} narration segment(s)` : ''} → ${out} in ${seconds}s\n`,
      );
      return;
    }
    case 'frame': {
      const doc = loadChecked(file, values.json);
      if (values.at === undefined) fail('frame: --at <seconds> is required');
      const seconds = Number(values.at);
      if (!Number.isFinite(seconds) || seconds < 0) fail(`frame: invalid --at ${values.at}`);
      const { film } = compileWithMarkers(
        doc,
        voiceDataFor(file, values['cache-dir']),
        mapsDataFor(doc),
      );
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
      const doc = loadChecked(file, values.json, values['cache-dir']);
      const { markers } = compileWithMarkers(
        doc,
        voiceDataFor(file, values['cache-dir']),
        mapsDataFor(doc),
      );
      process.stdout.write(timingTable(markers) + '\n');
      return;
    }
    default:
      fail(USAGE);
  }
}

await main();

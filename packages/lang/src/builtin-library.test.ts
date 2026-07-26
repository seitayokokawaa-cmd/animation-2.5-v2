/**
 * Built-in libraries stay loadable and well-formed (M5.5/M5.6): every
 * object parses, has unique part ids, and declared params are actually
 * referenced somewhere in its tree.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadLibraries } from './library.js';
import { partIds, referencedParams } from './parts.js';

const builtinDir = join(import.meta.dirname, '../../../assets/library');
const libraryFiles = readdirSync(builtinDir).filter((f) => f.endsWith('.yaml'));

describe('built-in object libraries', () => {
  it('finds at least the props library', () => {
    expect(libraryFiles).toContain('props.yaml');
  });

  const { objects, findings } = loadLibraries(
    libraryFiles.map((f) => `library/${f}`),
    { filmDir: builtinDir, builtinDir },
  );

  it('loads with zero findings', () => {
    expect(findings).toEqual([]);
  });

  it('props library ships the M5.5 set', () => {
    for (const name of [
      'desk',
      'throne',
      'scroll',
      'flagpole',
      'cannon',
      'tent',
      'well',
      'table',
      'chair',
      'lamp',
      'fence',
      'crate',
    ]) {
      expect(objects[name], name).toBeDefined();
    }
  });

  for (const [name, def] of Object.entries(objects)) {
    it(`object "${name}" is internally consistent`, () => {
      const ids = partIds(def);
      expect(new Set(ids).size, `duplicate part ids in ${name}`).toBe(ids.length);
      expect(
        ids.length,
        `${name} should be layered art, not a single shape`,
      ).toBeGreaterThanOrEqual(4);
      const declared = Object.keys(def.params).sort();
      const referenced = referencedParams(def);
      for (const param of referenced) {
        expect(declared, `${name} references undeclared $${param}`).toContain(param);
      }
      for (const param of declared) {
        expect(referenced, `${name} declares unused param ${param}`).toContain(param);
      }
    });
  }
});

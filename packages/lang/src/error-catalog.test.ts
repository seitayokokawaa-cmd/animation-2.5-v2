/** The error catalog (M12.4) tracks the code registry exactly. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MF_CODES } from './errors.js';

const CATALOG_DIR = join(import.meta.dirname, '..', '..', '..', 'docs', 'errors');

describe('error catalog (M12.4)', () => {
  it('has one page per registered MF code', () => {
    for (const [code, title] of Object.entries(MF_CODES)) {
      const page = join(CATALOG_DIR, `${code}.md`);
      expect(existsSync(page), `missing docs/errors/${code}.md`).toBe(true);
      const text = readFileSync(page, 'utf8');
      expect(text, `${code} page must carry its registry title`).toContain(title);
      expect(text).toContain('## Fix');
    }
  });

  it('has no orphan pages for unregistered codes', () => {
    const pages = readdirSync(CATALOG_DIR).filter((f) => /^MF\d+\.md$/.test(f));
    for (const page of pages) {
      const code = page.replace(/\.md$/, '');
      expect(code in MF_CODES, `docs/errors/${page} documents unknown code`).toBe(true);
    }
  });

  it('the index lists every code', () => {
    const index = readFileSync(join(CATALOG_DIR, 'README.md'), 'utf8');
    for (const code of Object.keys(MF_CODES)) expect(index).toContain(`[${code}]`);
  });
});

import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@motionforge/render scaffold', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@motionforge/render');
  });
});

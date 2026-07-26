import { describe, expect, it } from 'vitest';

import { MFS_VERSION, PACKAGE_NAME, TICKS_PER_SECOND } from './index.js';

describe('@motionforge/lang scaffold', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@motionforge/lang');
  });

  it('targets screenplay language version 1', () => {
    expect(MFS_VERSION).toBe(1);
  });

  it('resolves the workspace dependency on @motionforge/core', () => {
    expect(TICKS_PER_SECOND).toBe(120);
  });
});

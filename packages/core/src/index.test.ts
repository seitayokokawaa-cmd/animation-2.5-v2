import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME, TICKS_PER_SECOND } from './index.js';

describe('@motionforge/core scaffold', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@motionforge/core');
  });

  it('runs a 120 Hz internal clock divisible by all target frame rates', () => {
    expect(TICKS_PER_SECOND % 24).toBe(0);
    expect(TICKS_PER_SECOND % 30).toBe(0);
    expect(TICKS_PER_SECOND % 60).toBe(0);
  });
});

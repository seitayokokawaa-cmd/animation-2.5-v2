import { TICKS_PER_SECOND } from '@motionforge/core';

export const PACKAGE_NAME = '@motionforge/lang';

/** The screenplay language version accepted by this build (`motionforge: 1`). */
export const MFS_VERSION = 1;

export { TICKS_PER_SECOND };

export * from './schema.js';
export * from './narration.js';
export * from './narration-validate.js';
export * from './loader.js';
export * from './errors.js';
export * from './validate.js';
export * from './references.js';
export * from './compile.js';

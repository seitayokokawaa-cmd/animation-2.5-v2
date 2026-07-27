/**
 * Interaction primitives (M14.6): the attach/detach event log and the
 * registry entries the compiler lowers take/put/give/throw into.
 */
import { describe, expect, it } from 'vitest';

import { holdersAt } from './interactions.js';
import { verb } from './verbs.js';

const ev = (verbName: string, target: string, startTick: number, ref?: string) => ({
  verb: verbName,
  target,
  startTick,
  ...(ref ? { ref } : {}),
});

describe('interaction primitives (M14.6)', () => {
  it('registers reach/attach/detach', () => {
    expect(verb('reach').defaultDurationSeconds).toBe(0.9);
    expect(verb('attach').defaultDurationSeconds).toBe(0);
    expect(verb('detach').defaultDurationSeconds).toBe(0);
  });

  it('the event log folds to who-holds-what, latest event winning', () => {
    const effects = [
      ev('attach', 'bread', 60, 'fox'),
      ev('detach', 'bread', 240),
      ev('attach', 'bread', 300, 'crow'),
      ev('attach', 'coin', 100, 'fox'),
      ev('wiggle', 'coin', 500), // unrelated verbs are ignored
    ];
    expect(holdersAt(effects, 30).size).toBe(0);
    expect(holdersAt(effects, 100).get('bread')).toBe('fox');
    expect(holdersAt(effects, 250).has('bread')).toBe(false);
    expect(holdersAt(effects, 400).get('bread')).toBe('crow');
    expect(holdersAt(effects, 400).get('coin')).toBe('fox');
  });
});

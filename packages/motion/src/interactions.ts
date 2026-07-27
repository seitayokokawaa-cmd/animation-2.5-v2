/**
 * Interaction verbs (M14.6, plan §5.6): take / put / carry / give,
 * throw & catch, plus the reach that sells them. The authoring verbs
 * compile down to three registry primitives:
 *
 * - `reach` on a character: the near arm IK-solves toward a point
 *   (params `dx`/`dy`, character-relative world units) — the frame
 *   builder owns the solve, blending in and out across the window.
 * - `attach` on an item: from this event on, the item hides and rides
 *   the holder's hand (the effect's `ref` names the holder). Attach and
 *   detach form an event log; the latest event at a tick wins, so the
 *   validator and the frame builder agree on who holds what.
 * - `detach` on an item: the item returns to its own timeline.
 *
 * Doors/levers reuse the M5.3 `hinge`; sit-on reuses postures + seats.
 */

import type { VerbDef } from './verbs.js';

/** How far into a take/give reach the hand actually grabs (fraction). */
export const GRAB_POINT = 0.5;

export const INTERACTION_DEFS: VerbDef[] = [
  {
    name: 'reach',
    summary:
      'IK the near arm toward a point (M14.6) — the working half of ' +
      'take/give/throw/catch. Blends in and back out over the window.',
    defaultDurationSeconds: 0.9,
    // The solve needs the skeleton, so it lives in the frame builder.
    sample: () => ({}),
  },
  {
    name: 'attach',
    summary:
      "Event: the item starts riding the holder's hand (`ref`) and its " +
      'own drawing hides (M14.6). Latest attach/detach wins.',
    defaultDurationSeconds: 0,
    sample: () => ({}),
  },
  {
    name: 'detach',
    summary: 'Event: the item leaves the hand and returns to its timeline (M14.6).',
    defaultDurationSeconds: 0,
    sample: () => ({}),
  },
];

/**
 * Fold an attach/detach event log into "who holds what" at a tick.
 * Both the frame builder and tests use this one implementation.
 */
export function holdersAt(
  effects: readonly {
    readonly verb: string;
    readonly target: string;
    readonly startTick: number;
    readonly ref?: string;
  }[],
  tick: number,
): ReadonlyMap<string, string> {
  const held = new Map<string, string>();
  const events = effects
    .filter((e) => (e.verb === 'attach' || e.verb === 'detach') && e.startTick <= tick)
    .sort((a, b) => a.startTick - b.startTick);
  for (const e of events) {
    if (e.verb === 'attach' && e.ref) held.set(e.target, e.ref);
    else held.delete(e.target);
  }
  return held;
}

/**
 * Audio event bus (M9.1, plan §5.7): every sound the film wants, as data.
 * Cues come from three places, all deterministic:
 *
 * 1. explicit `sfx:` verbs (compiled as `sfx` effects carrying the name),
 * 2. verb defaults — a slam brings its own thud, a pop-in its pop
 *    (declared as `defaultSfx` on the motion verb registry),
 * 3. solver events later (footsteps, collisions) join the same stream.
 *
 * The bus only *collects*; the SFX library (M9.2) and mixer (M9.5) decide
 * what each cue sounds like.
 */

import type { Film, Tick } from '@motionforge/core';
import { VERB_REGISTRY } from '@motionforge/motion';

export interface SfxCue {
  /** Cue name, e.g. `pop`, `slam`, `boom`. */
  readonly name: string;
  /** Film-global tick. */
  readonly tick: Tick;
  /** Linear gain multiplier. */
  readonly gain: number;
  /** Where the cue came from (debugging + dedup rules). */
  readonly source: 'explicit' | 'verb-default';
}

/** Collect every SFX cue in the film, sorted by tick (stable). */
export function collectCues(film: Film): SfxCue[] {
  const cues: SfxCue[] = [];
  for (const scene of film.scenes) {
    for (const effect of scene.effects) {
      const tick = scene.startTick + effect.startTick;
      if (effect.verb === 'sfx') {
        if (effect.text) {
          cues.push({
            name: effect.text,
            tick,
            gain: (effect.params.gain ?? 100) / 100,
            source: 'explicit',
          });
        }
        continue;
      }
      const def = VERB_REGISTRY.get(effect.verb);
      if (def?.defaultSfx) {
        cues.push({ name: def.defaultSfx, tick, gain: 1, source: 'verb-default' });
      }
    }
  }
  return cues
    .map((cue, index) => ({ cue, index }))
    .sort((a, b) => a.cue.tick - b.cue.tick || a.index - b.index)
    .map(({ cue }) => cue);
}

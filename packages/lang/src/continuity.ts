/**
 * Validator T3 (M12.2): continuity. Four rule families:
 *
 * - **Presence**: an absolutely-timed action targets an actor while it is
 *   offstage — before its `enter` or after its `exit`.
 * - **Teleports**: consecutive scenes on the same stage place the same
 *   instance somewhere else with no exit/enter to motivate the jump.
 * - **Riders & carried things**: a placement mounts (`on:`) an instance
 *   whose template has no seat — the rider renders unmounted. (Held-item
 *   hand-offs join this family when M14.6 adds take/put.)
 * - **Line speakers**: every `lines:` speaker must be placed in its scene,
 *   or the bubble and flap-mouth silently target nobody.
 */

import type { Finding } from './errors.js';
import type { LoadedYaml } from './loader.js';
import type { MfsAction, MfsDocument, MfsScene } from './schema.js';

/** Cast templates with a saddle (mirrors the motion templates' `seat`). */
const MOUNTABLE_TEMPLATES = new Set(['horse', 'dog']);

/** Teleport tolerance, world units — small cross-cut re-blocking is
 * normal filmmaking; only body-sized jumps read as teleports. */
const TELEPORT_EPSILON = 1.5;

/** Every instance an action touches (for the presence check). */
function actionTargets(action: MfsAction): string[] {
  const out: string[] = [];
  for (const [name, payload] of Object.entries(action)) {
    if (name === 'at' || payload === null || typeof payload !== 'object') continue;
    const p = payload as { target?: unknown; targets?: unknown };
    if (typeof p.target === 'string') out.push(p.target);
    if (Array.isArray(p.targets)) {
      out.push(...p.targets.filter((t): t is string => typeof t === 'string'));
    }
  }
  return out;
}

/** Where an instance ends up in a scene (placement, or its last move). */
function finalPosition(scene: MfsScene, name: string): [number, number] | undefined {
  const placement = scene.place.find((p) => p.as === name);
  if (!placement) return undefined;
  let pos = placement.at;
  let latest = -Infinity;
  for (const action of scene.actions) {
    const to =
      action.move?.target === name
        ? action.move.to
        : action['bounce-to']?.target === name
          ? action['bounce-to'].to
          : undefined;
    if (to && action.at >= latest) {
      latest = action.at;
      pos = to;
    }
  }
  return pos;
}

export function checkContinuity(doc: MfsDocument, loaded: LoadedYaml, file: string): Finding[] {
  const findings: Finding[] = [];

  doc.scenes.forEach((scene, si) => {
    const placed = new Set(scene.place.map((p) => p.as));

    // -- line speakers on stage (plan §5.9) --------------------------------
    scene.lines.forEach((line, li) => {
      if (!placed.has(line.speaker)) {
        findings.push({
          code: 'MF2009',
          severity: 'error',
          file,
          pos: loaded.locate(['scenes', si, 'lines', li, 'speaker']),
          message: `Scene "${scene.id}": line speaker "${line.speaker}" is not placed in this scene`,
          hint: 'Place the speaker (or fix the name) — the bubble and flap-mouth need an actor.',
        });
      }
    });

    // -- riders need a saddle ----------------------------------------------
    scene.place.forEach((place, pi) => {
      if (place.on === undefined) return;
      const mount = scene.place.find((p) => p.as === place.on);
      if (!mount) return; // MF2002 already covers unknown mounts
      const template = doc.cast[mount.ref]?.template;
      if (template === undefined || !MOUNTABLE_TEMPLATES.has(template)) {
        findings.push({
          code: 'MF2010',
          severity: 'warning',
          file,
          pos: loaded.locate(['scenes', si, 'place', pi, 'on']),
          message: `Scene "${scene.id}": "${place.as}" rides "${place.on}" (${template ?? 'not a cast member'}), which has no seat`,
          hint: `Mount a template with a saddle (${[...MOUNTABLE_TEMPLATES].join(', ')}) — otherwise the rider renders standing at its own position.`,
        });
      }
    });

    // -- presence: don't direct actors who are offstage ---------------------
    const enterAt = new Map<string, number>();
    const exitEndsAt = new Map<string, number>();
    for (const action of scene.actions) {
      if (action.enter) {
        const t = enterAt.get(action.enter.target);
        enterAt.set(action.enter.target, Math.min(t ?? Infinity, action.at));
      }
      if (action.exit) {
        const end = action.at + (action.exit.duration ?? 0.7);
        const t = exitEndsAt.get(action.exit.target);
        exitEndsAt.set(action.exit.target, Math.max(t ?? -Infinity, end));
      }
    }
    scene.actions.forEach((action, ai) => {
      if (action.enter || action.exit) return;
      for (const target of actionTargets(action)) {
        const enter = enterAt.get(target);
        const exitEnd = exitEndsAt.get(target);
        const before = enter !== undefined && action.at < enter;
        const after = exitEnd !== undefined && action.at >= exitEnd;
        if (!before && !after) continue;
        findings.push({
          code: 'MF2007',
          severity: 'warning',
          file,
          pos: loaded.locate(['scenes', si, 'actions', ai]),
          message: before
            ? `Scene "${scene.id}": action at ${action.at}s targets "${target}" before it enters (enters at ${enter}s)`
            : `Scene "${scene.id}": action at ${action.at}s targets "${target}" after it exits (gone by ${exitEnd}s)`,
          hint: before
            ? 'Move the action after the enter, or drop the enter.'
            : 'Move the action before the exit, or bring the actor back with enter.',
        });
      }
    });

    // -- teleports between consecutive same-stage scenes --------------------
    // A declared transition (iris, fade, …) marks a passage of time and
    // motivates any re-blocking, so those scenes are exempt.
    if (si === 0 || scene.transition) return;
    const prev = doc.scenes[si - 1]!;
    if (!scene.stage || !prev.stage || scene.stage.preset !== prev.stage.preset) return;
    const prevExits = new Set(prev.actions.filter((a) => a.exit).map((a) => a.exit!.target));
    const curEnters = new Set(scene.actions.filter((a) => a.enter).map((a) => a.enter!.target));
    scene.place.forEach((place, pi) => {
      const prevPlace = prev.place.find((p) => p.as === place.as && p.ref === place.ref);
      if (!prevPlace || prevExits.has(place.as) || curEnters.has(place.as)) return;
      const last = finalPosition(prev, place.as)!;
      const dx = place.at[0] - last[0];
      const dy = place.at[1] - last[1];
      if (Math.hypot(dx, dy) <= TELEPORT_EPSILON) return;
      findings.push({
        code: 'MF2008',
        severity: 'warning',
        file,
        pos: loaded.locate(['scenes', si, 'place', pi, 'at']),
        message: `Scene "${scene.id}": "${place.as}" teleports to [${place.at.join(', ')}] — scene "${prev.id}" left it at [${last.join(', ')}] on the same stage`,
        hint: 'Match the previous position, move it there on-screen, or use exit/enter (or a different stage) to motivate the jump.',
      });
    });
  });

  return findings;
}

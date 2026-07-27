/**
 * Validator T3 (M14.6): held-item state. Attach/detach are timeline
 * events, so the validator can replay each scene's take/put/give/throw
 * actions in time order and know who holds what — put without a take,
 * a hand-off of somebody else's item, or a double-take all read as
 * glitches on screen (an item teleporting between hands or vanishing).
 *
 * Holders reset at scene cuts, matching the engine: attachment effects
 * are scene-local, so a held item must be re-taken after a cut.
 */

import type { Finding } from './errors.js';
import type { LoadedYaml } from './loader.js';
import type { MfsDocument } from './schema.js';

export function checkInteractions(doc: MfsDocument, loaded: LoadedYaml, file: string): Finding[] {
  const findings: Finding[] = [];

  doc.scenes.forEach((scene, si) => {
    // itemName -> holderName, replayed in time order within the scene.
    const holder = new Map<string, string>();
    const ordered = scene.actions
      .map((action, ai) => ({ action, ai }))
      .sort((a, b) => a.action.at - b.action.at || a.ai - b.ai);

    for (const { action, ai } of ordered) {
      if (action.take) {
        const { target, item } = action.take;
        const current = holder.get(item);
        if (current !== undefined) {
          findings.push({
            code: 'MF2012',
            severity: 'warning',
            file,
            pos: loaded.locate(['scenes', si, 'actions', ai, 'take']),
            message:
              current === target
                ? `Scene "${scene.id}": "${target}" takes "${item}" at ${action.at}s but already holds it`
                : `Scene "${scene.id}": "${target}" takes "${item}" at ${action.at}s while "${current}" is holding it`,
            hint:
              current === target
                ? 'Drop the duplicate take.'
                : `Have "${current}" put or give the item first — or use \`give:\` for a hand-off.`,
          });
        }
        holder.set(item, target);
      } else if (action.put ?? action.throw) {
        const a = (action.put ?? action.throw)!;
        const verb = action.put ? 'put' : 'throw';
        const current = holder.get(a.item);
        if (current !== a.target) {
          findings.push({
            code: 'MF2011',
            severity: 'warning',
            file,
            pos: loaded.locate(['scenes', si, 'actions', ai, verb]),
            message:
              current === undefined
                ? `Scene "${scene.id}": "${a.target}" ${verb}s "${a.item}" at ${action.at}s without taking it first`
                : `Scene "${scene.id}": "${a.target}" ${verb}s "${a.item}" at ${action.at}s but "${current}" is holding it`,
            hint: `Add a \`take:\` for "${a.target}" earlier in the scene (holders reset at scene cuts).`,
          });
        }
        if (verb === 'put') holder.delete(a.item);
        else if (action.throw && typeof action.throw.to === 'string') {
          holder.set(a.item, action.throw.to);
        } else {
          holder.delete(a.item);
        }
      } else if (action.give) {
        const { target, to, item } = action.give;
        const current = holder.get(item);
        if (current !== target) {
          findings.push({
            code: 'MF2011',
            severity: 'warning',
            file,
            pos: loaded.locate(['scenes', si, 'actions', ai, 'give']),
            message:
              current === undefined
                ? `Scene "${scene.id}": "${target}" gives "${item}" at ${action.at}s without taking it first`
                : `Scene "${scene.id}": "${target}" gives "${item}" at ${action.at}s but "${current}" is holding it`,
            hint: `Add a \`take:\` for "${target}" earlier in the scene (holders reset at scene cuts).`,
          });
        }
        holder.set(item, to);
      }
    }
  });

  return findings;
}

/**
 * The fully-wired spec document (M12.5): the lang generator plus the
 * registry data only the CLI can see (motion verbs, render styles/SFX,
 * vendored map sources). `mf spec` prints it; the drift test compares it
 * to the committed docs/SPEC.md.
 */

import { generateSpec } from '@motionforge/lang';
import { VERB_REGISTRY } from '@motionforge/motion';
import { SFX_NAMES, STYLE_PRESETS } from '@motionforge/render';

import { GEODATA_SOURCES } from './geodata.js';

export function buildSpec(): string {
  return generateSpec({
    verbs: Object.fromEntries(
      [...VERB_REGISTRY].map(([name, def]) => [
        name,
        {
          summary: def.summary,
          defaultSeconds: def.defaultDurationSeconds,
          ...(def.defaultSfx ? { defaultSfx: def.defaultSfx } : {}),
        },
      ]),
    ),
    stylePresets: Object.keys(STYLE_PRESETS),
    sfxNames: SFX_NAMES,
    mapSources: Object.keys(GEODATA_SOURCES),
  });
}

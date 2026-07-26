/**
 * Beat templates (M13.2): every expansion must be schema-valid AND
 * validator-clean when spliced into a film — beats never introduce
 * findings.
 */
import { check } from '@motionforge/lang';
import { describe, expect, it } from 'vitest';

import {
  allianceMapBeat,
  battleBeat,
  BEAT_NAMES,
  betrayalBeat,
  indentBeat,
  ultimatumBeat,
} from './beats.js';

const HEADER = `motionforge: 2
meta: { title: T, resolution: 1280x720, fps: 30 }
voices:
  narrator: { engine: mock, voice: warm }
  envoy: { engine: mock, voice: bright, pitch: 6 }
  king: { engine: mock, voice: gravel, pitch: -2 }
cast:
  king: { template: potato-biped, costume: [crown, royal-uniform] }
  envoy: { template: potato-biped, costume: [suit] }
maps:
  world: { source: naturalearth/europe-110m, groups: { entente: [france, serbia] } }
`;

const film = (sceneYaml: string): string => `${HEADER}scenes:\n${indentBeat(sceneYaml, 2)}\n`;

const checkClean = (yaml: string): void => {
  const result = check(yaml, 'beat.mfs.yaml', { cacheProbe: { probe: () => 'ok' } });
  expect(result.doc, result.findings.map((f) => `${f.code} ${f.message}`).join('\n')).toBeDefined();
  expect(result.findings.map((f) => `${f.code} ${f.message}`)).toEqual([]);
};

describe('beat templates (M13.2)', () => {
  it('exports the four plan beats', () => {
    expect([...BEAT_NAMES]).toEqual([
      'ultimatum-beat',
      'alliance-map-beat',
      'battle-beat',
      'betrayal-beat',
    ]);
  });

  it('ultimatum-beat expands validator-clean', () => {
    checkClean(
      film(
        ultimatumBeat({
          id: 'ultimatum',
          aggressor: 'envoy',
          victim: 'king',
          voice: 'narrator',
          narration:
            'The envoy presented a list of demands so unreasonable that even the paper refused.',
          demandAnchor: 'list of demands',
          refusalAnchor: 'paper refused',
          demands: ['give us everything', 'apologize forever', 'also your hats'],
          refusalLine: 'Absolutely not.',
        }),
      ),
    );
  });

  it('alliance-map-beat expands validator-clean', () => {
    checkClean(
      film(
        allianceMapBeat({
          id: 'alliances',
          map: 'world',
          voice: 'narrator',
          narration: 'Europe sorted itself into two heavily armed friend groups.',
          groups: { entente: '#3c6fb5' },
          groupAnchors: { entente: 'friend groups' },
          labels: { entente: 'The Entente' },
        }),
      ),
    );
  });

  it('battle-beat expands validator-clean', () => {
    checkClean(
      film(
        battleBeat({
          id: 'battle',
          map: 'world',
          voice: 'narrator',
          narration: 'The army marched straight at Serbia and the border promptly moved.',
          attackAnchor: 'marched straight',
          clashAnchor: 'promptly moved',
          attacker: { from: 'france', color: '#3c6fb5' },
          target: 'serbia',
        }),
      ),
    );
  });

  it('betrayal-beat expands validator-clean', () => {
    checkClean(
      film(
        betrayalBeat({
          id: 'betrayal',
          betrayer: 'envoy',
          betrayed: 'king',
          voice: 'narrator',
          narration: 'They were the best of friends, right up until the paperwork said otherwise.',
          trustAnchor: 'best of friends',
          betrayalAnchor: 'said otherwise',
          reactionLine: 'Rude.',
        }),
      ),
    );
  });

  it('quotes hostile text safely', () => {
    const yaml = film(
      ultimatumBeat({
        id: 'quoting',
        aggressor: 'envoy',
        victim: 'king',
        voice: 'narrator',
        narration: "The king's men couldn't quite believe the demand list either.",
        demandAnchor: "king's men",
        refusalAnchor: 'demand list',
        demands: ["the king's hat"],
        refusalLine: "Don't.",
      }),
    );
    checkClean(yaml);
  });
});

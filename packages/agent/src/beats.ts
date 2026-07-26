/**
 * Beat templates (M13.2, plan §5.10): the genre's reusable scene patterns
 * as parameterized macros. The direction pass splices these instead of
 * inventing choreography from scratch — an ultimatum, an alliance map, a
 * battle, a betrayal each come pre-timed with the gags that make them
 * land. Every expansion is validator-clean by construction (the tests
 * check() each one).
 *
 * The human-facing catalog lives in docs/style-guide.md; keep the two in
 * step when adding a beat.
 */

/** Single-quote a YAML scalar (doubles internal quotes). */
const q = (text: string): string => `'${text.replaceAll("'", "''")}'`;

export interface UltimatumBeatParams {
  readonly id: string;
  /** Placed `as` names. */
  readonly aggressor: string;
  readonly victim: string;
  /** Narrator voice + the segment text (must contain the anchors). */
  readonly voice: string;
  readonly narration: string;
  /** Phrase in `narration` where the demands land. */
  readonly demandAnchor: string;
  /** Phrase in `narration` where the refusal lands. */
  readonly refusalAnchor: string;
  readonly demands: readonly string[];
  /** The victim's squeaked one-liner. */
  readonly refusalLine: string;
}

export interface AllianceMapBeatParams {
  readonly id: string;
  /** Placed map instance `as` name. */
  readonly map: string;
  readonly voice: string;
  readonly narration: string;
  /** group name → hex color, revealed on `groupAnchors[name]`. */
  readonly groups: Readonly<Record<string, string>>;
  readonly groupAnchors: Readonly<Record<string, string>>;
  /** group name → display label. */
  readonly labels: Readonly<Record<string, string>>;
}

export interface BattleBeatParams {
  readonly id: string;
  readonly map: string;
  readonly voice: string;
  readonly narration: string;
  /** Attack arrows fly on this phrase. */
  readonly attackAnchor: string;
  /** The clash + capture land on this phrase. */
  readonly clashAnchor: string;
  readonly attacker: { readonly from: string; readonly color: string };
  /** Region id under attack (arrow target, battle site, recolor, flag). */
  readonly target: string;
}

export interface BetrayalBeatParams {
  readonly id: string;
  readonly betrayer: string;
  readonly betrayed: string;
  readonly voice: string;
  readonly narration: string;
  /** The friendly setup lands here… */
  readonly trustAnchor: string;
  /** …and the knife lands here. */
  readonly betrayalAnchor: string;
  /** The betrayed's last-word squeak. */
  readonly reactionLine: string;
}

const indentBlock = (yaml: string, spaces: number): string =>
  yaml
    .split('\n')
    .map((line) => (line.length > 0 ? ' '.repeat(spaces) + line : line))
    .join('\n');

/** An ultimatum: demands slam down, the victim boggles, refusal squeaks. */
export function ultimatumBeat(p: UltimatumBeatParams): string {
  return `- id: ${p.id}
  stage: { preset: throne-room }
  music: { mood: tense }
  place:
    - { ref: ${p.aggressor}, as: ${p.aggressor}, at: [-2.2, -2.6] }
    - { ref: ${p.victim}, as: ${p.victim}, at: [2.2, -2.6], facing: left }
  narration:
    - voice: ${p.voice}
      text: ${q(p.narration)}
      sync:
        - { on: ${q(p.demandAnchor)}, do: { gesture: { target: ${p.aggressor}, kind: point } } }
        - { on: ${q(p.demandAnchor)}, offset: 0.1, do: { sfx: quill } }
        - {
            on: ${q(p.demandAnchor)},
            offset: 0.2,
            do:
              {
                card:
                  {
                    style: list,
                    items: [${p.demands.map(q).join(', ')}],
                    at: [2.6, 1.4],
                    duration: 3.4,
                  },
              },
          }
        - {
            on: ${q(p.refusalAnchor)},
            do: { react: { target: ${p.victim}, kind: eye-bulge, duration: 1.6 } },
          }
        - {
            on: ${q(p.refusalAnchor)},
            offset: 0.15,
            do: { camera: { zoom-punch: ${p.victim}, punch: 1.55, duration: 0.8 } },
          }
  lines:
    - { after: ${q(p.refusalAnchor)}, speaker: ${p.victim}, say: ${q(p.refusalLine)} }`;
}

/** An alliance map: sides sweep into color, one label per side. */
export function allianceMapBeat(p: AllianceMapBeatParams): string {
  const reveals = Object.entries(p.groups).flatMap(([group, color]) => {
    const anchor = p.groupAnchors[group]!;
    const label = p.labels[group];
    return [
      `        - { on: ${q(anchor)}, do: { map: { recolor: { ${group}: ${q(color)} }, duration: 0.6 } } }`,
      ...(label
        ? [
            `        - { on: ${q(anchor)}, offset: 0.3, do: { label: { target: ${p.map}, of: { ${group}: ${q(label)} } } } }`,
            `        - { on: ${q(anchor)}, offset: 0.3, do: { sfx: pop } }`,
          ]
        : []),
    ];
  });
  return `- id: ${p.id}
  music: { mood: somber, gain: 80 }
  place:
    - { ref: ${p.map}, as: ${p.map}, at: [0, 0] }
  narration:
    - voice: ${p.voice}
      text: ${q(p.narration)}
      sync:
${reveals.join('\n')}`;
}

/** A battle: arrow in, clash burst, territory flips, flag plants. */
export function battleBeat(p: BattleBeatParams): string {
  return `- id: ${p.id}
  music: { mood: tense }
  place:
    - { ref: ${p.map}, as: ${p.map}, at: [0, 0] }
  narration:
    - voice: ${p.voice}
      text: ${q(p.narration)}
      sync:
        - { on: ${q(p.attackAnchor)}, do: { sfx: riser } }
        - {
            on: ${q(p.attackAnchor)},
            do:
              {
                arrow:
                  { target: ${p.map}, from: ${p.attacker.from}, to: ${p.target}, color: ${q(p.attacker.color)} },
              },
          }
        - {
            on: ${q(p.attackAnchor)},
            offset: 0.2,
            do: { march: { target: ${p.map}, from: ${p.attacker.from}, to: ${p.target}, kind: infantry } },
          }
        - { on: ${q(p.clashAnchor)}, do: { battle: { target: ${p.map}, at: ${p.target} } } }
        - {
            on: ${q(p.clashAnchor)},
            offset: 0.3,
            do: { map: { recolor: { ${p.target}: ${q(p.attacker.color)} }, duration: 0.5 } },
          }
        - {
            on: ${q(p.clashAnchor)},
            offset: 0.6,
            do: { plant-flag: { target: ${p.map}, at: ${p.target}, color: ${q(p.attacker.color)} } },
          }
        - { on: ${q(p.clashAnchor)}, offset: 0.6, do: { sfx: drumroll } }`;
}

/** A betrayal: warmth, then the turn — hearts to bonk, punch on the turn. */
export function betrayalBeat(p: BetrayalBeatParams): string {
  return `- id: ${p.id}
  stage: { preset: palace-hall }
  music: { mood: jaunty, gain: 85 }
  grade: dusk
  place:
    - { ref: ${p.betrayer}, as: ${p.betrayer}, at: [-1.6, -2.6] }
    - { ref: ${p.betrayed}, as: ${p.betrayed}, at: [1.6, -2.6], facing: left }
  narration:
    - voice: ${p.voice}
      text: ${q(p.narration)}
      sync:
        - {
            on: ${q(p.trustAnchor)},
            do: { react: { target: ${p.betrayed}, kind: hearts, duration: 1.8 } },
          }
        - {
            on: ${q(p.trustAnchor)},
            do: { shot: { kind: two-shot, of: [${p.betrayer}, ${p.betrayed}], duration: 0.6 } },
          }
        - { on: ${q(p.betrayalAnchor)}, offset: -0.4, do: { sfx: riser } }
        - { on: ${q(p.betrayalAnchor)}, do: { bonk: { target: ${p.betrayed} } } }
        - { on: ${q(p.betrayalAnchor)}, offset: 0.1, do: { camera: { shake: 0.4 } } }
        - {
            on: ${q(p.betrayalAnchor)},
            offset: 0.25,
            do: { camera: { zoom-punch: ${p.betrayed}, punch: 1.6, duration: 0.8 } },
          }
        - { on: ${q(p.betrayalAnchor)}, offset: 0.3, do: { sfx: sting } }
  lines:
    - { after: ${q(p.betrayalAnchor)}, speaker: ${p.betrayed}, say: ${q(p.reactionLine)}, react: deadpan }`;
}

/** Catalog for the direction pass and the style guide. */
export const BEAT_NAMES = [
  'ultimatum-beat',
  'alliance-map-beat',
  'battle-beat',
  'betrayal-beat',
] as const;

export { indentBlock as indentBeat };

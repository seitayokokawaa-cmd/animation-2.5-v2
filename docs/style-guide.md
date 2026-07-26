# MotionForge style guide (M13.2)

The genre bible the direction pass reads before touching a screenplay.
The bar: a viewer should not clock the film as template-generated. These
rules are the difference.

## Pacing

- **A beat every 2–5 seconds.** Something pops, moves, cuts, or reveals
  — the validator warns on dead air (MF3006). Narration alone is not a
  beat.
- **Sync to words, not seconds.** Every visual lands on a phrase
  (`sync.on`); reserve absolute `at:` for silent scenes.
- **One idea per card.** ≥ 0.8 s + 1 s per 15 characters, never past
  8 s (MF3009). Two attention grabs never share a 0.3 s window (MF3007).
- **Scenes are 10–25 s.** Longer means it wanted to be two scenes.
- **Music states the act**: `jaunty` for setups, `tense` for escalation,
  `somber` for maps and aftermath, `triumphant` sparingly. Change mood at
  scene boundaries only.

## Cinematography

- **Punch the reaction, not the action.** `zoom-punch` on the face that
  *receives* the news, 0.15–0.3 s after the anchor.
- **Whip between speakers** (`whip: true`), **cut** to reset framing,
  glide only when the narration is calm.
- **Frame with presets** (`shot:`) — `two-shot` for negotiations,
  `close-up` for reactions, `wide` to reset after chaos.
- **Transitions mark time**: `iris` to open/close the film, `crossfade`
  for time passing, `wipe` for place changes. Bare cuts inside a
  location.
- **Grade for mood**: `dusk` when things sour, `night` for aftermath.

## Gag patterns

- **Rule of three**: two straight instances, the third breaks (list
  cards: two reasonable demands, one absurd).
- **Deadpan after chaos**: after any explosion/fling, hold, then a tiny
  `react: deadpan` or a two-word line ("It really is.").
- **Small voice, big news**: character lines are ≤ 6 words, squeaked
  (`pitch: 5+`), and land *after* the narrator's phrase.
- **Oversized paperwork**: scrolls, lists, and stamps make bureaucracy
  the villain — `sfx: quill` is the punchline's setup.
- **The camera is a character**: it flinches (`shake`) on impacts and
  leans in (`zoom-punch`) on faces. Never both on the same beat.

## Beat templates (parameterized macros)

`@motionforge/agent` exports these as functions returning a ready scene —
the direction pass fills parameters instead of inventing structure. All
expansions are validator-clean by construction.

| Beat | Signature highlights | What it stages |
|---|---|---|
| `ultimatum-beat` | aggressor, victim, `demandAnchor`, `refusalAnchor`, `demands[]`, `refusalLine` | Point + quill, demands list card (rule of three!), victim eye-bulge, zoom-punch, squeaked refusal |
| `alliance-map-beat` | map, `groups{name→color}`, `groupAnchors`, `labels` | Recolor sweeps per side with popped labels, somber bed |
| `battle-beat` | map, attacker `{from,color}`, `target`, `attackAnchor`, `clashAnchor` | Riser + arrow + infantry march, clash burst, territory flip, flag + drumroll |
| `betrayal-beat` | betrayer, betrayed, `trustAnchor`, `betrayalAnchor`, `reactionLine` | Two-shot + hearts, riser turn, bonk + shake + punch + sting, deadpan last word |

Usage: write the narration first, pick the anchor phrases, then call the
beat with those phrases. The beat owns choreography; the writer owns
words.

## Writing rules (script pass)

- Hook inside the first sentence; the title card lands on it.
- Narrate in the past tense, present the absurdity straight.
- Every scene's narration must physically contain its anchor phrases —
  quote them verbatim.
- Proper nouns get a `label` or `lower-third` on first appearance.
- End scenes on the joke, not the exposition.

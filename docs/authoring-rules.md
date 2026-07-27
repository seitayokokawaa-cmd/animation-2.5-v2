# YAML rules for authors

The conventions that keep a screenplay valid, well-paced, and in the
genre — for humans and LLMs alike. `mf author` follows these; `mf check`
enforces the enforceable ones.

## Structure

1. **One film, one file.** `motionforge: 2` at the top; `meta` needs
   `title`, `resolution`, `fps`, and a `seed` (the seed is your only
   source of randomness — pick one and keep it).
2. **Names are kebab-case** (`red-king`, `war-map`). Placement `as:`
   names are the ids everything else targets.
3. **Author in seconds and degrees.** Never ticks, never radians.
4. **Positions live on a 10-unit-tall stage**, y-up, origin center.
   Characters stand around `y ≈ -2.6` on the standard stage presets.
5. **Quote things that could confuse YAML**: text with colons, phrases
   with apostrophes, anything starting with `[` or `{`.

## Narration first

6. **Write the narration before any visuals.** Segments of one to three
   sentences; each segment is one beat of the film.
7. **Anchor visuals to phrases** (`sync: on:`) rather than absolute
   times; the film re-times itself when the voice changes. Use `at:`
   actions only inside explicitly-`duration:`ed scenes.
8. **Anchor phrases must quote the text verbatim** — the validator
   fails on phrases it can't find (MF3002) and disambiguates repeats
   with `nth:`.
9. **A visual on roughly every phrase.** Dead air over 5 s is a warning
   (MF3006); more than ~3 events on one phrase is a pile-up (MF3007).

## Blocking

10. **Move characters with gaits** (`walk`/`run`/`sneak`) or
    `bounce-to`; reserve raw `move` for props and cards. Feet never
    slide — that is the engine's promise, keep it visible.
11. **Continuity is validated.** Don't target actors before `enter:` or
    after `exit:` (MF2007); don't re-place an actor across a cut far
    from where it stood without a transition (MF2008); place every
    `lines:` speaker (MF2009).
12. **Possession is validated.** `take` before `put`/`give`/`throw`
    (MF2011); hand off with `give`, not a second `take` (MF2012).
13. **One exclusive action per actor at a time** — two travel verbs or
    two gestures overlapping on one target is a glitch (MF2005/MF2006).

## The look

14. **Set `style: explainer-paper`** unless there's a reason not to.
15. **Cast reads by silhouette**: one costume cue per character, sizes
    between 0.6 and 1.1, palette contrast between rivals.
16. **Cards are punctuation, not paragraphs** — a date, a title, a
    short list. One at a time; the validator computes read time.
17. **Cut wide after tight.** Follow a `close-up` or `zoom-punch` with
    a `wide` within a few seconds so the stage geography stays legible.
18. **End scenes on a beat** — a reaction, a card, a landed gag — not
    mid-motion.

## Workflow

19. `mf voice sync` after narration edits; `mf check` before render;
    `mf frame --at` to eyeball any instant; `mf storyboard` before
    committing to a full render.
20. **If `mf check` passes, `mf render` succeeds.** Treat warnings as
    taste notes from an editor; fix them unless you disagree on
    purpose.

/**
 * Storyboard review (M13.4): pick the frames worth looking at, and run
 * the vision-critique pass over the rendered contact sheet. Frame
 * rendering and tiling live in the CLI (render package); this module
 * owns the deterministic tick selection and the critique prompt.
 */

import { secondsToTicks, type Film, type Tick } from '@motionforge/core';

import type { LlmAdapter } from './llm.js';

export interface StoryboardShot {
  readonly tick: Tick;
  readonly label: string;
}

/**
 * Two shots per scene: just after it settles (0.5 s in) and its midpoint.
 * Short scenes fall back to their midpoint only.
 */
export function storyboardShots(film: Film): StoryboardShot[] {
  const shots: StoryboardShot[] = [];
  for (const scene of film.scenes) {
    const settle = scene.startTick + secondsToTicks(0.5);
    const mid = scene.startTick + Math.floor(scene.durationTicks / 2);
    if (mid - settle > secondsToTicks(1)) {
      shots.push({ tick: settle, label: `${scene.id} open` });
    }
    shots.push({ tick: mid, label: `${scene.id} mid` });
  }
  return shots;
}

export interface CritiqueOptions {
  readonly title: string;
  /** docs/style-guide.md contents. */
  readonly styleGuide: string;
  readonly shots: readonly StoryboardShot[];
}

/**
 * Vision critique: judge the contact sheet against the style guide.
 * Returns markdown — findings first, each tied to a panel label.
 */
export async function critiqueStoryboard(
  llm: LlmAdapter,
  sheet: Uint8Array,
  options: CritiqueOptions,
): Promise<string> {
  const panels = options.shots.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
  return llm.complete({
    system:
      'You are the animation director reviewing a storyboard contact ' +
      'sheet for a short explainer. Judge pacing, composition, ' +
      'readability, and variety against the style guide below. Answer in ' +
      'markdown: a one-line verdict, then a bullet per problem naming ' +
      'the panel number and the concrete fix. Say "ship it" if nothing ' +
      'blocks.\n\n--- STYLE GUIDE ---\n' +
      options.styleGuide,
    messages: [
      {
        role: 'user',
        content:
          `Film: ${options.title}\n` +
          `The attached sheet reads left-to-right, top-to-bottom:\n${panels}`,
      },
    ],
    images: [sheet],
  });
}

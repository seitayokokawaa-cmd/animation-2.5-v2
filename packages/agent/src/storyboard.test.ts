import { secondsToTicks, type Film } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { MockLlmAdapter } from './llm.js';
import { critiqueStoryboard, storyboardShots } from './storyboard.js';

const film = {
  title: 'T',
  scenes: [
    { id: 'long', startTick: 0, durationTicks: secondsToTicks(6) },
    { id: 'short', startTick: secondsToTicks(6), durationTicks: secondsToTicks(1.2) },
  ],
} as unknown as Film;

describe('storyboard review (M13.4)', () => {
  it('picks an opening and midpoint shot per scene, midpoint only when short', () => {
    const shots = storyboardShots(film);
    expect(shots.map((s) => s.label)).toEqual(['long open', 'long mid', 'short mid']);
    expect(shots[0]!.tick).toBe(secondsToTicks(0.5));
    expect(shots[1]!.tick).toBe(secondsToTicks(3));
    expect(shots[2]!.tick).toBe(secondsToTicks(6) + secondsToTicks(1.2) / 2);
  });

  it('critique attaches the sheet and names every panel', async () => {
    const llm = new MockLlmAdapter(['- panel 2: too empty']);
    const critique = await critiqueStoryboard(llm, Uint8Array.from([9, 9]), {
      title: 'The War',
      styleGuide: 'THE GUIDE',
      shots: storyboardShots(film),
    });
    expect(critique).toContain('panel 2');
    const request = llm.requests[0]!;
    expect(request.images).toHaveLength(1);
    expect(request.system).toContain('THE GUIDE');
    expect(request.messages[0]!.content).toContain('1. long open');
    expect(request.messages[0]!.content).toContain('3. short mid');
  });
});

/**
 * Character template registry — the render tier looks templates up by the
 * name a `cast:` entry declares. Bipeds ship in potato.ts (M6.4),
 * quadrupeds in quadruped.ts (M6.8).
 */

import { potatoBiped, type CharacterOptions, type CharacterTemplate } from './potato.js';
import { birdTemplate, fishTemplate } from './creature.js';
import { dogTemplate, horseTemplate } from './quadruped.js';

export const CHARACTER_TEMPLATES: Readonly<
  Record<string, (options: CharacterOptions) => CharacterTemplate>
> = {
  'potato-biped': potatoBiped,
  bird: birdTemplate,
  fish: fishTemplate,
  horse: horseTemplate,
  dog: dogTemplate,
};

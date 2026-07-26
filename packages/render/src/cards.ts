/**
 * Cards, labels, and framed cutaways (M4.5, plan §5.6). Cards are timed
 * overlay panels: date/chapter plates, comedy list cards whose items pop in
 * one by one, quote plates, paper notes, nametag labels, and framed
 * cutaways containing a shape snippet. Entrances are pop (overshoot) or
 * slam (drop + squash); everything exits with a short fade.
 *
 * Text runs through the shaping pipeline (ADR-0002) — Bengali/Arabic/CJK
 * cards work exactly like Latin ones.
 */

import {
  clamp,
  compose,
  ease,
  parseColor,
  scaling,
  translation,
  type Color,
  type FilmCard,
  type SceneNode,
  type Tick,
} from '@motionforge/core';

import { shapeText } from './text.js';

export interface CardTheme {
  readonly plate: Color;
  readonly plateAlt: Color;
  readonly text: Color;
  readonly textOnAlt: Color;
  readonly accent: Color;
}

export const DEFAULT_CARD_THEME: CardTheme = {
  plate: parseColor('#b5453c'),
  plateAlt: parseColor('#efe6d0'),
  text: parseColor('#ffffff'),
  textOnAlt: parseColor('#3a3226'),
  accent: parseColor('#ffd9a0'),
};

const ENTRANCE_SECONDS = 0.35;
const EXIT_SECONDS = 0.25;

interface Entrance {
  readonly scale: number;
  readonly dy: number;
  readonly squash: number;
  readonly opacity: number;
}

function entrancePose(card: FilmCard, t01: number, exit01: number): Entrance {
  const tIn = clamp(t01 / (ENTRANCE_SECONDS / secondsOf(card)), 0, 1);
  const opacity = exit01 > 0 ? 1 - exit01 : 1;
  if (card.entrance === 'slam') {
    if (tIn < 0.7) {
      return { scale: 1, dy: (1 - ease('quadIn', tIn / 0.7)) * 3, squash: 0, opacity };
    }
    const u = (tIn - 0.7) / 0.3;
    return { scale: 1, dy: 0, squash: Math.sin(Math.PI * u) * 0.22, opacity };
  }
  return { scale: ease('backOut', tIn), dy: 0, squash: 0, opacity };
}

const secondsOf = (card: FilmCard): number => card.durationTicks / 120;

/** One shaped, centered text row as glyph-path nodes. */
function textRow(
  id: string,
  text: string,
  font: string,
  size: number,
  color: Color,
  x: number,
  y: number,
  align: 'center' | 'left' = 'center',
): { node: SceneNode; width: number } {
  const run = shapeText(font, text);
  const s = size / run.upem;
  const width = run.width * s;
  const xStart = align === 'center' ? x - width / 2 : x;
  return {
    width,
    node: {
      id,
      transform: translation(xStart, y),
      children: run.paths.map((glyph, gi): SceneNode => ({
        id: `${id}-g${gi}`,
        transform: compose(translation(glyph.x * s, glyph.y * s), scaling(s, s)),
        shape: { kind: 'path', d: glyph.d },
        fill: { color },
      })),
    },
  };
}

const plate = (id: string, w: number, h: number, color: Color, rx = 0.18): SceneNode => ({
  id,
  shape: { kind: 'rect', width: w, height: h, rx },
  fill: { color },
});

/** Build the node tree for one card at a scene-local tick (empty if idle). */
export function buildCardNodes(
  card: FilmCard,
  localTick: Tick,
  index: number,
  theme: CardTheme = DEFAULT_CARD_THEME,
): SceneNode[] {
  const end = card.startTick + card.durationTicks;
  if (localTick < card.startTick || localTick >= end) return [];
  const t01 = (localTick - card.startTick) / card.durationTicks;
  const exitStart = 1 - EXIT_SECONDS / secondsOf(card);
  const exit01 = t01 > exitStart ? (t01 - exitStart) / (1 - exitStart) : 0;
  const pose = entrancePose(card, t01, exit01);

  const children: SceneNode[] = [];
  const id = `card-${index}`;
  const size = card.size;

  switch (card.style) {
    case 'date':
    case 'chapter': {
      const row = textRow(`${id}-t`, card.text ?? '', card.font, size, theme.text, 0, -size * 0.35);
      children.push(
        plate(`${id}-p`, row.width + size * 1.2, size * 1.8, theme.plate, size * 0.18),
        row.node,
      );
      break;
    }
    case 'quote': {
      const row = textRow(
        `${id}-t`,
        card.text ?? '',
        card.font,
        size,
        theme.textOnAlt,
        0,
        -size * 0.35,
      );
      const w = row.width + size * 1.6;
      children.push(
        plate(`${id}-p`, w, size * 2, theme.plateAlt, size * 0.12),
        {
          id: `${id}-bar`,
          transform: translation(-w / 2 + size * 0.35, 0),
          shape: { kind: 'rect', width: size * 0.14, height: size * 1.5 },
          fill: { color: theme.accent },
        },
        row.node,
      );
      break;
    }
    case 'note': {
      const row = textRow(
        `${id}-t`,
        card.text ?? '',
        card.font,
        size,
        theme.textOnAlt,
        0,
        -size * 0.35,
      );
      children.push(
        {
          ...plate(`${id}-p`, row.width + size * 1.2, size * 1.9, theme.plateAlt, 0.04),
          transform: translation(0, 0),
        },
        row.node,
      );
      break;
    }
    case 'label': {
      const labelSize = size * 0.8;
      const row = textRow(
        `${id}-t`,
        card.text ?? '',
        card.font,
        labelSize,
        theme.text,
        0,
        -labelSize * 0.35,
      );
      children.push(
        plate(`${id}-p`, row.width + labelSize, labelSize * 1.6, theme.plate, labelSize * 0.3),
        row.node,
      );
      break;
    }
    case 'list': {
      const items = card.items ?? [];
      const rowGap = size * 1.5;
      // Rows are positioned by their wrapper; each row only carries its
      // own baseline adjustment.
      const rows = items.map((item, i) =>
        textRow(`${id}-i${i}`, item, card.font, size, theme.textOnAlt, 0, -size * 0.35, 'left'),
      );
      const maxWidth = Math.max(0.5, ...rows.map((r) => r.width));
      const h = items.length * rowGap + size;
      children.push({
        ...plate(`${id}-p`, maxWidth + size * 2.2, h, theme.plateAlt, 0.1),
        transform: translation(0, -((items.length - 1) * rowGap) / 2),
      });
      // Items pop in one at a time, 0.4 s apart, with a bullet each.
      const sinceStart = (localTick - card.startTick) / 120;
      items.forEach((_, i) => {
        const itemT = clamp((sinceStart - i * 0.4) / 0.25, 0, 1);
        if (itemT <= 0) return;
        const itemScale = ease('backOut', itemT);
        children.push({
          id: `${id}-item${i}`,
          transform: compose(
            translation(-maxWidth / 2, -i * rowGap),
            scaling(itemScale, itemScale),
          ),
          children: [
            {
              id: `${id}-b${i}`,
              transform: translation(-size * 0.55, 0),
              shape: { kind: 'circle', r: size * 0.16 },
              fill: { color: theme.accent },
            },
            rows[i]!.node,
          ],
        });
      });
      break;
    }
  }

  // Framed cutaway content: paper frame + the snippet inside.
  if (card.content) {
    const frame = card.size * 3;
    children.push(
      { ...plate(`${id}-frame`, frame + 0.3, frame + 0.3, theme.plateAlt, 0.1) },
      { ...plate(`${id}-inner`, frame, frame, theme.accent, 0.06), opacity: 0.25 },
      {
        id: `${id}-content`,
        transform: scaling(card.content.scale, card.content.scale),
        shape: card.content.shape,
        fill: card.content.fill,
        stroke: card.content.stroke,
      },
    );
  }

  // Plates must paint under their card's text regardless of screen-y, so
  // backgrounds get `base` and content gets `base + 1` explicitly.
  const base = 2000 + index * 10;
  const isPlate = (nodeId: string) =>
    nodeId.endsWith('-p') || nodeId.endsWith('-frame') || nodeId.endsWith('-inner');
  const layered = children.map((child) => ({
    ...child,
    layer: isPlate(child.id) ? base : base + 1,
  }));

  const wobble = card.entrance === 'slam' ? 0 : Math.sin(t01 * Math.PI * 2) * 0.01;
  return [
    {
      id,
      depth: 0,
      layer: base,
      opacity: pose.opacity,
      transform: compose(
        translation(card.at.x, card.at.y + pose.dy),
        compose(
          scaling(pose.scale * (1 + pose.squash), pose.scale * (1 - pose.squash)),
          scaling(1 + wobble, 1 - wobble),
        ),
      ),
      children: layered,
    },
  ];
}

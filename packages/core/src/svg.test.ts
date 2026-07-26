import { describe, expect, it } from 'vitest';

import { parseColor } from './color.js';
import { translation, vec2 } from './math.js';
import { flattenScene, painterSort, type SceneNode } from './scene.js';
import { emitSvg, fmtNumber } from './svg.js';

const OPTS = { width: 320, height: 180 };

const scene = (children: SceneNode[]): SceneNode => ({ id: 'root', children });

const items = (children: SceneNode[]) => painterSort(flattenScene(scene(children)));

describe('fmtNumber', () => {
  it('formats at fixed precision with trimmed zeros', () => {
    expect(fmtNumber(1)).toBe('1');
    expect(fmtNumber(1.5)).toBe('1.5');
    expect(fmtNumber(1.23456)).toBe('1.235');
    expect(fmtNumber(10.1004)).toBe('10.1');
    expect(fmtNumber(-0.0001)).toBe('0');
    expect(fmtNumber(-0)).toBe('0');
  });

  it('rejects non-finite values', () => {
    expect(() => fmtNumber(Number.NaN)).toThrow(/Non-finite/);
    expect(() => fmtNumber(Infinity)).toThrow(/Non-finite/);
  });
});

describe('emitSvg', () => {
  it('is byte-identical across repeated emissions', () => {
    const kids: SceneNode[] = [
      {
        id: 'a',
        transform: translation(10.00004, 20),
        shape: { kind: 'circle', r: 5 },
        fill: { color: parseColor('#d94f30') },
      },
    ];
    expect(emitSvg(items(kids), OPTS)).toBe(emitSvg(items(kids), OPTS));
  });

  it('sorts attributes alphabetically and omits identity transforms', () => {
    const svg = emitSvg(
      items([
        {
          id: 'a',
          shape: { kind: 'rect', width: 10, height: 20 },
          fill: { color: parseColor('#ff0000') },
          stroke: { color: parseColor('#000000'), width: 2 },
        },
      ]),
      OPTS,
    );
    expect(svg).toContain(
      '<rect fill="#ff0000" height="20" stroke="#000000" stroke-width="2" width="10"/>',
    );
    expect(svg).not.toContain('matrix(1 0 0 1 0 0)');
  });

  it('emits transforms with fixed precision', () => {
    const svg = emitSvg(
      items([
        {
          id: 'a',
          transform: translation(1.23456, -0.0001),
          shape: { kind: 'circle', r: 3 },
        },
      ]),
      OPTS,
    );
    expect(svg).toContain('transform="matrix(1 0 0 1 1.235 0)"');
  });

  it('dedupes identical gradients into one def, numbered in first-use order', () => {
    const gradient = {
      from: vec2(0, 0),
      to: vec2(0, 10),
      stops: [
        { offset: 0, color: parseColor('#ffffff') },
        { offset: 1, color: parseColor('#000000') },
      ],
    };
    const other = { ...gradient, to: vec2(10, 0) };
    const svg = emitSvg(
      items([
        { id: 'a', shape: { kind: 'rect', width: 5, height: 5 }, fill: { gradient } },
        { id: 'b', shape: { kind: 'rect', width: 5, height: 5 }, fill: { gradient } },
        { id: 'c', shape: { kind: 'rect', width: 5, height: 5 }, fill: { gradient: other } },
      ]),
      OPTS,
    );
    expect(svg.match(/<linearGradient/g)).toHaveLength(2);
    expect(svg.match(/url\(#g0\)/g)).toHaveLength(2);
    expect(svg.match(/url\(#g1\)/g)).toHaveLength(1);
  });

  it('renders opacity, polygons, paths, and background', () => {
    const svg = emitSvg(
      items([
        {
          id: 'p',
          opacity: 0.5,
          shape: { kind: 'polygon', points: [vec2(0, 0), vec2(10, 0), vec2(5, 8.12345)] },
          fill: { color: parseColor('#3c6fb5') },
        },
        { id: 'd', shape: { kind: 'path', d: 'M0 0L10 10Z' } },
      ]),
      { ...OPTS, background: '#cfdbd5' },
    );
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('points="0,0 10,0 5,8.123"');
    expect(svg).toContain('<path d="M0 0L10 10Z" fill="none"/>');
    expect(svg).toContain('<rect fill="#cfdbd5" height="180" width="320"/>');
  });
});

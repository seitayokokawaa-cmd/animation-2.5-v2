/**
 * Object part-tree schema (M5.1, plan §5.2/v1 M3). An object is a named
 * tree of parts: shapes with local transforms, pivots for articulation,
 * gradient fills, and color parameter slots (`$name`) resolved at
 * placement. Objects live in the film's `objects:` block or in library
 * files loaded via `use:` (M5.4).
 */

import { z } from 'zod';

const colorSchema = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, {
  message: 'Expected a hex color like #d94f30',
});

/** `$slot` references a color param declared on the object. */
const paramRefSchema = z.string().regex(/^\$[a-z][a-z0-9-]*$/, {
  message: 'Param references look like $body-color',
});

const nameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

const vec2Schema = z.tuple([z.number().finite(), z.number().finite()]);

const gradientSchema = z
  .object({
    from: vec2Schema,
    to: vec2Schema,
    stops: z
      .array(z.object({ offset: z.number().min(0).max(1), color: colorSchema }).strict())
      .min(2),
  })
  .strict();

/** Solid color, param slot, or linear gradient. */
export const paintSchema = z.union([colorSchema, paramRefSchema, gradientSchema]);

const partShapeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('rect'),
      width: z.number().finite().positive(),
      height: z.number().finite().positive(),
      rx: z.number().finite().nonnegative().optional(),
    })
    .strict(),
  z.object({ kind: z.literal('circle'), r: z.number().finite().positive() }).strict(),
  z
    .object({
      kind: z.literal('ellipse'),
      rx: z.number().finite().positive(),
      ry: z.number().finite().positive(),
    })
    .strict(),
  z.object({ kind: z.literal('polygon'), points: z.array(vec2Schema).min(3) }).strict(),
  z.object({ kind: z.literal('path'), d: z.string().min(1) }).strict(),
]);

const strokeSchema = z
  .object({ color: colorSchema, width: z.number().finite().positive() })
  .strict();

export interface MfsPart {
  id: string;
  at?: [number, number] | undefined;
  /** Degrees. */
  rotate?: number | undefined;
  scale?: number | undefined;
  /** Rotation origin for articulation, part-local units. Default [0,0]. */
  pivot?: [number, number] | undefined;
  /** Draw order inside the object (higher = on top). Default: tree order. */
  z?: number | undefined;
  shape?: z.infer<typeof partShapeSchema> | undefined;
  fill?: z.infer<typeof paintSchema> | undefined;
  stroke?: z.infer<typeof strokeSchema> | undefined;
  parts?: MfsPart[] | undefined;
}

export const partSchema: z.ZodType<MfsPart> = z.lazy(() =>
  z
    .object({
      id: nameSchema,
      at: vec2Schema.optional(),
      rotate: z.number().finite().optional(),
      scale: z.number().finite().positive().optional(),
      pivot: vec2Schema.optional(),
      z: z.number().int().optional(),
      shape: partShapeSchema.optional(),
      fill: paintSchema.optional(),
      stroke: strokeSchema.optional(),
      parts: z.array(partSchema).optional(),
    })
    .strict(),
);

export const objectDefSchema = z
  .object({
    /** Color parameter slots with default values. */
    params: z.record(nameSchema, colorSchema).default({}),
    parts: z.array(partSchema).min(1),
  })
  .strict();

export type MfsObjectDef = z.infer<typeof objectDefSchema>;

/** Every part id in the tree, depth-first — duplicate detection and docs. */
export function partIds(def: MfsObjectDef): string[] {
  const ids: string[] = [];
  const walk = (parts: readonly MfsPart[]): void => {
    for (const part of parts) {
      ids.push(part.id);
      if (part.parts) walk(part.parts);
    }
  };
  walk(def.parts);
  return ids;
}

/** Param slots referenced by `$name` fills anywhere in the tree. */
export function referencedParams(def: MfsObjectDef): string[] {
  const refs = new Set<string>();
  const walk = (parts: readonly MfsPart[]): void => {
    for (const part of parts) {
      if (typeof part.fill === 'string' && part.fill.startsWith('$')) refs.add(part.fill.slice(1));
      if (part.parts) walk(part.parts);
    }
  };
  walk(def.parts);
  return [...refs].sort();
}

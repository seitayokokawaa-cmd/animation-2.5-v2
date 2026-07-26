/**
 * MFS schema v0 (plan v2 §9 M2.1) — meta, named shapes, scenes with
 * placements and timed actions (move/rotate/scale/caption/camera). zod is
 * the single source of truth; every type the toolchain uses is inferred.
 *
 * Conventions: authors write seconds and degrees; world units are y-up with
 * the origin at screen center and 10 world units spanning the viewport
 * height. The compiler converts to ticks/radians/pixels once.
 */

import { TICKS_PER_SECOND } from '@motionforge/core';
import { z } from 'zod';

const colorSchema = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, {
  message: 'Expected a hex color like #d94f30 or #d94f3080',
});

const nameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, {
  message: 'Names are kebab-case: lowercase letters, digits, dashes, starting with a letter',
});

const vec2Schema = z.tuple([z.number().finite(), z.number().finite()]);

const secondsSchema = z.number().finite().nonnegative();

export const EASING_CHOICES = [
  'linear',
  'quadIn',
  'quadOut',
  'quadInOut',
  'cubicIn',
  'cubicOut',
  'cubicInOut',
  'quartIn',
  'quartOut',
  'quartInOut',
  'sineIn',
  'sineOut',
  'sineInOut',
  'expoIn',
  'expoOut',
  'backIn',
  'backOut',
  'elasticOut',
  'bounceIn',
  'bounceOut',
] as const;

const easingSchema = z.enum(EASING_CHOICES);

export const FONT_CHOICES = ['noto-sans', 'noto-bengali', 'noto-arabic', 'noto-sc'] as const;

const strokeSchema = z
  .object({
    color: colorSchema,
    width: z.number().finite().positive(),
  })
  .strict();

const shapeBase = {
  fill: colorSchema.optional(),
  stroke: strokeSchema.optional(),
};

const shapeDefSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('rect'),
      width: z.number().finite().positive(),
      height: z.number().finite().positive(),
      rx: z.number().finite().nonnegative().optional(),
      ...shapeBase,
    })
    .strict(),
  z.object({ kind: z.literal('circle'), r: z.number().finite().positive(), ...shapeBase }).strict(),
  z
    .object({
      kind: z.literal('ellipse'),
      rx: z.number().finite().positive(),
      ry: z.number().finite().positive(),
      ...shapeBase,
    })
    .strict(),
  z
    .object({
      kind: z.literal('polygon'),
      points: z.array(vec2Schema).min(3),
      ...shapeBase,
    })
    .strict(),
]);

const placeSchema = z
  .object({
    ref: nameSchema,
    as: nameSchema,
    at: vec2Schema,
    depth: z.number().min(0).max(1).optional(),
    layer: z.number().int().optional(),
    scale: z.number().finite().positive().optional(),
    /** Degrees, counter-clockwise. */
    rotate: z.number().finite().optional(),
  })
  .strict();

const tweenBase = {
  target: nameSchema,
  duration: secondsSchema,
  easing: easingSchema.optional(),
};

const actionSchema = z
  .object({
    /** Seconds from scene start. */
    at: secondsSchema,
    move: z
      .object({ ...tweenBase, to: vec2Schema })
      .strict()
      .optional(),
    rotate: z
      .object({ ...tweenBase, to: z.number().finite() })
      .strict()
      .optional(),
    scale: z
      .object({ ...tweenBase, to: z.number().finite().positive() })
      .strict()
      .optional(),
    caption: z
      .object({
        text: z.string().min(1),
        duration: secondsSchema,
        at: vec2Schema.optional(),
        /** World units tall; default 0.6. */
        size: z.number().finite().positive().optional(),
        color: colorSchema.optional(),
        font: z.enum(FONT_CHOICES).optional(),
      })
      .strict()
      .optional(),
    camera: z
      .object({
        to: vec2Schema.optional(),
        zoom: z.number().finite().positive().optional(),
        duration: secondsSchema,
        easing: easingSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (action) => {
      const verbs = ['move', 'rotate', 'scale', 'caption', 'camera'].filter(
        (v) => (action as Record<string, unknown>)[v] !== undefined,
      );
      return verbs.length === 1;
    },
    { message: 'Each action needs exactly one verb: move, rotate, scale, caption, or camera' },
  );

const sceneSchema = z
  .object({
    id: nameSchema,
    /** Seconds; scene durations are explicit in v0 (narration derives them in M3). */
    duration: z.number().finite().positive(),
    place: z.array(placeSchema).default([]),
    actions: z.array(actionSchema).default([]),
  })
  .strict();

export const mfsSchema = z
  .object({
    motionforge: z.literal(1),
    meta: z
      .object({
        title: z.string().min(1),
        resolution: z.string().regex(/^\d{3,4}x\d{3,4}$/, {
          message: 'Expected WIDTHxHEIGHT, e.g. 1920x1080',
        }),
        fps: z
          .number()
          .int()
          .positive()
          .refine((fps) => TICKS_PER_SECOND % fps === 0, {
            message: `fps must divide the ${TICKS_PER_SECOND} Hz tick clock (24, 30, 60, …)`,
          }),
        seed: z.number().int().nonnegative().default(0),
        background: colorSchema.optional(),
      })
      .strict(),
    shapes: z.record(nameSchema, shapeDefSchema).default({}),
    scenes: z.array(sceneSchema).min(1),
  })
  .strict();

export type MfsDocument = z.infer<typeof mfsSchema>;
export type MfsShapeDef = z.infer<typeof shapeDefSchema>;
export type MfsScene = z.infer<typeof sceneSchema>;
export type MfsPlace = z.infer<typeof placeSchema>;
export type MfsAction = z.infer<typeof actionSchema>;
export type MfsEasing = z.infer<typeof easingSchema>;

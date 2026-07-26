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

import { makeNarrationSchema, voiceSpecSchema } from './narration.js';

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

const effectBase = {
  target: nameSchema,
  /** Seconds; defaults match the motion verb registry (asserted by M12.5). */
  duration: secondsSchema.optional(),
};

/** The verb payload fields, shared by timed actions and narration sync. */
const verbFields = {
  'pop-in': z
    .object({ ...effectBase, to: z.number().finite().positive().optional() })
    .strict()
    .optional(),
  'pop-out': z.object(effectBase).strict().optional(),
  'spin-in': z
    .object({ ...effectBase, turns: z.number().finite().optional() })
    .strict()
    .optional(),
  slam: z
    .object({
      ...effectBase,
      height: z.number().finite().positive().optional(),
      /** Camera-shake intensity in world units; 0 disables. */
      shake: z.number().finite().nonnegative().optional(),
    })
    .strict()
    .optional(),
  wiggle: z
    .object({
      ...effectBase,
      amplitude: z.number().finite().nonnegative().optional(),
      speed: z.number().finite().positive().optional(),
    })
    .strict()
    .optional(),
  pulse: z
    .object({ ...effectBase, to: z.number().finite().positive().optional() })
    .strict()
    .optional(),
  explode: z
    .object({ ...effectBase, radius: z.number().finite().positive().optional() })
    .strict()
    .optional(),
  'impact-stars': z
    .object({ ...effectBase, count: z.number().int().positive().optional() })
    .strict()
    .optional(),
  speedlines: z
    .object({ ...effectBase, angle: z.number().finite().optional() })
    .strict()
    .optional(),
  sweat: z
    .object({ ...effectBase, count: z.number().int().positive().optional() })
    .strict()
    .optional(),
  steam: z.object(effectBase).strict().optional(),
  'squash-stretch': z
    .object({
      ...effectBase,
      amount: z.number().finite().positive().optional(),
      beats: z.number().int().positive().optional(),
    })
    .strict()
    .optional(),
  'bounce-to': z
    .object({
      target: nameSchema,
      to: vec2Schema,
      /** Seconds; default derives from hop count (0.35 s per hop). */
      duration: secondsSchema.optional(),
      hops: z.number().int().positive().optional(),
      /** Hop height in world units. */
      height: z.number().finite().positive().optional(),
    })
    .strict()
    .optional(),
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
  card: z
    .object({
      style: z.enum(['date', 'chapter', 'list', 'quote', 'note', 'label']),
      text: z.string().min(1).optional(),
      items: z.array(z.string().min(1)).min(1).optional(),
      at: vec2Schema.optional(),
      duration: secondsSchema,
      /** Text height in world units; defaults per style. */
      size: z.number().finite().positive().optional(),
      entrance: z.enum(['pop', 'slam']).optional(),
      font: z.enum(FONT_CHOICES).optional(),
    })
    .strict()
    .refine((c) => (c.style === 'list' ? c.items !== undefined : c.text !== undefined), {
      message: 'List cards need items:; every other card style needs text:',
    })
    .optional(),
  cutaway: z
    .object({
      /** Shape name shown inside the paper frame. */
      ref: nameSchema,
      at: vec2Schema.optional(),
      duration: secondsSchema,
      scale: z.number().finite().positive().optional(),
      entrance: z.enum(['pop', 'slam']).optional(),
    })
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
};

export const VERB_NAMES = [
  'explode',
  'impact-stars',
  'speedlines',
  'sweat',
  'steam',
  'squash-stretch',
  'bounce-to',
  'move',
  'rotate',
  'scale',
  'caption',
  'card',
  'cutaway',
  'camera',
  'pop-in',
  'pop-out',
  'spin-in',
  'slam',
  'wiggle',
  'pulse',
];

const oneVerb = (value: Record<string, unknown>): boolean =>
  VERB_NAMES.filter((v) => value[v] !== undefined).length === 1;

const ONE_VERB_MESSAGE = {
  message: `Exactly one verb is required: ${VERB_NAMES.join(', ')}`,
};

/** A verb without timing — narration sync supplies the time via the anchor. */
export const verbSchema = z
  .object(verbFields)
  .strict()
  .refine((v) => oneVerb(v as Record<string, unknown>), ONE_VERB_MESSAGE);

const actionSchema = z
  .object({
    /** Seconds from scene start. */
    at: secondsSchema,
    ...verbFields,
  })
  .strict()
  .refine((v) => oneVerb(v as Record<string, unknown>), ONE_VERB_MESSAGE);

const sceneSchema = z
  .object({
    id: nameSchema,
    /**
     * Seconds. Optional when the scene has narration — its duration then
     * derives from the narration audio (plus pauses) at compile time.
     */
    duration: z.number().finite().positive().optional(),
    place: z.array(placeSchema).default([]),
    actions: z.array(actionSchema).default([]),
    narration: makeNarrationSchema(verbSchema).default([]),
  })
  .strict()
  .refine((scene) => scene.duration !== undefined || scene.narration.length > 0, {
    message: 'A scene needs either an explicit duration or narration to derive one from',
    path: ['duration'],
  });

export const mfsSchema = z
  .object({
    motionforge: z.union([z.literal(1), z.literal(2)]),
    voices: z.record(nameSchema, voiceSpecSchema).default({}),
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
        style: z.enum(['explainer-paper', 'clean-flat']).optional(),
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

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
import { objectDefSchema } from './parts.js';

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
    /** Mirror horizontally (objects only). */
    flip: z.boolean().optional(),
    /** Which way a cast member looks (cast only); default right. */
    facing: z.enum(['left', 'right']).optional(),
    /** Ride another placed cast member with a seat (horse/dog, M6.8). */
    on: nameSchema.optional(),
    /** Multiply-tint every fill (objects only). */
    tint: colorSchema.optional(),
    /** Color param overrides (objects only). */
    with: z.record(nameSchema, colorSchema).optional(),
  })
  .strict();

/** Palette slots understood by the character templates (kebab-case here;
 * the compiler maps them to the template's camelCase slot names). */
export const CAST_PALETTE_SLOTS = ['skin', 'outfit', 'outfit-dark', 'outline', 'boots'] as const;

const castPaletteSchema = z
  .object(
    Object.fromEntries(CAST_PALETTE_SLOTS.map((slot) => [slot, colorSchema.optional()])) as Record<
      (typeof CAST_PALETTE_SLOTS)[number],
      z.ZodOptional<typeof colorSchema>
    >,
  )
  .strict();

/** Face expression presets (kept in sync with the motion registry; the
 * drift check is an M12.5 deliverable, like the verb defaults). */
export const EXPRESSION_CHOICES = [
  'neutral',
  'happy',
  'angry',
  'sad',
  'shocked',
  'deadpan',
] as const;

/** Costume pieces, facial hair, and held items (motion registry names). */
export const COSTUME_CHOICES = [
  'crown',
  'spiked-helmet',
  'plumed-hat',
  'turban',
  'beret',
  'royal-uniform',
  'military-uniform',
  'suit',
  'robe',
  'peasant-tunic',
] as const;

export const MUSTACHE_CHOICES = ['imperial', 'handlebar', 'chevron', 'goatee'] as const;

export const HELD_CHOICES = ['scroll', 'sword', 'staff', 'flag'] as const;

/** Reaction kinds (M6.7) — order matches motion's REACTION_KINDS index. */
export const REACTION_CHOICES = [
  'jaw-drop',
  'eye-bulge',
  'sweat',
  'anger-steam',
  'hearts',
  'deadpan',
] as const;

/** Maps (M7.2): a vendored basemap + custom regions + alliance groups. */
const lonLatSchema = z.tuple([z.number().finite(), z.number().finite()]);

const mapRegionDefSchema = z
  .object({
    /** Hand-drawn lon/lat ring (blobby on purpose). */
    points: z.array(lonLatSchema).min(3),
    /** Base region ids this historical region replaces. */
    replace: z.array(nameSchema).optional(),
  })
  .strict();

const mapDefSchema = z
  .object({
    /** Vendored basemap: world at 110m (wide shots) or 50m (close-ups —
     * crisper real borders when zooming a single country), or the Europe
     * subset. Region ids agree across all three. */
    source: z.enum([
      'naturalearth/world-110m',
      'naturalearth/world-50m',
      'naturalearth/europe-110m',
    ]),
    style: z.enum(['paper', 'clean']).optional(),
    /** Map width in world units; default 16. */
    width: z.number().finite().positive().optional(),
    /** Lon/lat window: { lon: [min, max], lat: [min, max] }. */
    view: z
      .object({
        lon: z.tuple([z.number().finite(), z.number().finite()]),
        lat: z.tuple([z.number().finite(), z.number().finite()]),
      })
      .strict()
      .optional(),
    groups: z.record(nameSchema, z.array(nameSchema).min(1)).default({}),
    regions: z.record(nameSchema, mapRegionDefSchema).default({}),
  })
  .strict();

/** A cast member (M6.4): a named character built from a rig template. */
const castMemberSchema = z
  .object({
    template: z.enum(['potato-biped', 'horse', 'dog']),
    size: z.number().finite().positive().optional(),
    palette: castPaletteSchema.optional(),
    /** Resting face (M6.5); reactions override it per beat (M6.7). */
    expression: z.enum(EXPRESSION_CHOICES).optional(),
    /** Outfits + headwear, drawn in order (M6.6). */
    costume: z.array(z.enum(COSTUME_CHOICES)).optional(),
    mustache: z.enum(MUSTACHE_CHOICES).optional(),
    /** Item gripped by the near hand (M6.6). */
    held: z.enum(HELD_CHOICES).optional(),
  })
  .strict();

const tweenBase = {
  target: nameSchema,
  duration: secondsSchema,
  easing: easingSchema.optional(),
};

/** `instance.part` — articulation verbs target parts inside objects. */
const partTargetSchema = z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, {
  message: 'Articulation targets are instance.part, e.g. cart-1.wheel',
});

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
  hearts: z
    .object({ ...effectBase, count: z.number().int().positive().optional() })
    .strict()
    .optional(),
  /** Face takeover on a cast member (M6.7). */
  react: z
    .object({
      target: nameSchema,
      kind: z.enum(REACTION_CHOICES),
      duration: secondsSchema.optional(),
    })
    .strict()
    .optional(),
  /** Offensive arrows (M7.4): region name or [x,y] endpoints, curved. */
  arrow: z
    .object({
      /** Placed map instance; optional when the scene has exactly one map. */
      target: nameSchema.optional(),
      from: z.union([nameSchema, vec2Schema]),
      /** One destination or several (a multi-arrow offensive, staggered). */
      to: z.union([nameSchema, vec2Schema, z.array(z.union([nameSchema, vec2Schema])).min(1)]),
      color: colorSchema.optional(),
      /** Body width, world units. */
      width: z.number().finite().positive().optional(),
      /** Sideways bow as a fraction of length; sign picks the side. */
      bow: z.number().finite().optional(),
      duration: secondsSchema.optional(),
    })
    .strict()
    .optional(),
  /** Marching unit columns (M7.5). */
  march: z
    .object({
      target: nameSchema.optional(),
      from: z.union([nameSchema, vec2Schema]),
      to: z.union([nameSchema, vec2Schema]),
      kind: z.enum(['infantry', 'cavalry', 'ship', 'plane']).optional(),
      count: z.number().int().positive().max(12).optional(),
      color: colorSchema.optional(),
      bow: z.number().finite().optional(),
      duration: secondsSchema.optional(),
    })
    .strict()
    .optional(),
  /** Clash burst at a point/region (M7.5). */
  battle: z
    .object({
      target: nameSchema.optional(),
      at: z.union([nameSchema, vec2Schema]),
      duration: secondsSchema.optional(),
    })
    .strict()
    .optional(),
  /** Plant a waving flag (M7.5). */
  'plant-flag': z
    .object({
      target: nameSchema.optional(),
      at: z.union([nameSchema, vec2Schema]),
      color: colorSchema.optional(),
    })
    .strict()
    .optional(),
  /** Region/alliance nameplates (M7.6): { region-or-group: "Text" }. */
  label: z
    .object({
      target: nameSchema.optional(),
      of: z.record(nameSchema, z.string().min(1)),
      /** Text height, world units. */
      size: z.number().finite().positive().optional(),
    })
    .strict()
    .optional(),
  /** Camera framing from a region's bbox (M7.6). */
  'zoom-to': z
    .object({
      target: nameSchema.optional(),
      region: nameSchema,
      duration: secondsSchema.optional(),
      easing: easingSchema.optional(),
      /** Extra world units around the bbox. */
      margin: z.number().finite().nonnegative().optional(),
    })
    .strict()
    .optional(),
  /** Map region verbs (M7.3): recolor sweeps, highlights, border morphs. */
  map: z
    .object({
      /** Placed map instance; optional when the scene has exactly one map. */
      target: nameSchema.optional(),
      /** Region/group → new color; members sweep in with a small stagger. */
      recolor: z.record(nameSchema, colorSchema).optional(),
      /** Region or group to pulse. */
      highlight: nameSchema.optional(),
      /** Border change: region morphs into another region's shape. */
      morph: z.object({ region: nameSchema, to: nameSchema }).strict().optional(),
      duration: secondsSchema.optional(),
    })
    .strict()
    .refine((m) => m.recolor !== undefined || m.highlight !== undefined || m.morph !== undefined, {
      message: 'map: needs recolor:, highlight:, or morph:',
    })
    .optional(),
  hinge: z
    .object({
      target: partTargetSchema,
      /** Degrees. */
      to: z.number().finite(),
      from: z.number().finite().optional(),
      duration: secondsSchema.optional(),
    })
    .strict()
    .optional(),
  oscillate: z
    .object({
      target: partTargetSchema,
      /** Degrees. */
      amplitude: z.number().finite().positive().optional(),
      cycles: z.number().finite().positive().optional(),
      duration: secondsSchema.optional(),
    })
    .strict()
    .optional(),
  piston: z
    .object({
      target: partTargetSchema,
      axis: z.enum(['x', 'y']).optional(),
      amplitude: z.number().finite().positive().optional(),
      cycles: z.number().finite().positive().optional(),
      duration: secondsSchema.optional(),
    })
    .strict()
    .optional(),
  roll: z
    .object({
      target: partTargetSchema,
      /** Wheel radius in world units. */
      radius: z.number().finite().positive(),
      duration: secondsSchema.optional(),
    })
    .strict()
    .optional(),
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
  'hearts',
  'react',
  'map',
  'arrow',
  'march',
  'battle',
  'plant-flag',
  'label',
  'zoom-to',
  'squash-stretch',
  'hinge',
  'oscillate',
  'piston',
  'roll',
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

const backdropSchema = z.union([
  colorSchema,
  z.object({ top: colorSchema, bottom: colorSchema }).strict(),
]);

const sceneSchema = z
  .object({
    id: nameSchema,
    /** Screen-fixed background gradient (or flat color) for this scene. */
    backdrop: backdropSchema.optional(),
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
    objects: z.record(nameSchema, objectDefSchema).default({}),
    cast: z.record(nameSchema, castMemberSchema).default({}),
    maps: z.record(nameSchema, mapDefSchema).default({}),
    /** Library files (project-relative or built-in `library/…`) — M5.4. */
    use: z.array(z.string().min(1)).default([]),
    scenes: z.array(sceneSchema).min(1),
  })
  .strict();

export type MfsDocument = z.infer<typeof mfsSchema>;
export type MfsShapeDef = z.infer<typeof shapeDefSchema>;
export type MfsCastMember = z.infer<typeof castMemberSchema>;
export type MfsMapDef = z.infer<typeof mapDefSchema>;
export type MfsScene = z.infer<typeof sceneSchema>;
export type MfsPlace = z.infer<typeof placeSchema>;
export type MfsAction = z.infer<typeof actionSchema>;
export type MfsEasing = z.infer<typeof easingSchema>;

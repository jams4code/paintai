import { z } from 'zod'

/**
 * The spec language an agent writes.
 *
 * This is deliberately narrower than Excalidraw's own element skeleton. A model
 * handed forty optional fields will use them inconsistently; handed six it gets
 * them right every time. Anything omitted here is a decision `scene-ops` makes
 * on the agent's behalf, which is the whole point.
 *
 * Every field an agent can set is one more thing that can be set wrong, so the
 * bar for adding to this file is high.
 */

/** A point in scene coordinates. */
export const PointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

/**
 * Where an arrow starts or ends.
 *
 * Either a bare point, or a reference to another spec's id. References are what
 * produce real Excalidraw bindings, which is the difference between a diagram
 * that survives being dragged and one that falls apart.
 */
export const EndpointSchema = z.union([PointSchema, z.object({ ref: z.string().min(1) })])

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'expected a hex colour like #1e1e1e')

/** Shared optional styling. Omitted means "use the canvas default". */
const StyleFields = {
  stroke: hex.optional(),
  background: hex.optional(),
  /** Ignored unless `background` is set. */
  fill: z.enum(['solid', 'hachure', 'cross-hatch']).optional(),
  strokeWidth: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  opacity: z.number().min(0).max(100).optional(),
}

/** A shape, optionally with a label bound inside it. */
export const BoxSpecSchema = z.object({
  kind: z.literal('box'),
  /** Stable handle so arrows can point at this. Generated when omitted. */
  id: z.string().min(1).optional(),
  shape: z.enum(['rectangle', 'ellipse', 'diamond']).default('rectangle'),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().positive(),
  h: z.number().positive(),
  /** Bound to the shape, so it moves and wraps with it. */
  label: z.string().optional(),
  fontSize: z.number().positive().optional(),
  ...StyleFields,
})

/** Free-standing text, not bound to anything. */
export const TextSpecSchema = z.object({
  kind: z.literal('text'),
  id: z.string().min(1).optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  text: z.string().min(1),
  fontSize: z.number().positive().optional(),
  stroke: hex.optional(),
  opacity: z.number().min(0).max(100).optional(),
})

/** An arrow or line, optionally bound to shapes at either end. */
export const ArrowSpecSchema = z.object({
  kind: z.literal('arrow'),
  id: z.string().min(1).optional(),
  style: z.enum(['arrow', 'line']).default('arrow'),
  from: EndpointSchema,
  to: EndpointSchema,
  /** Bound to the arrow's midpoint. */
  label: z.string().optional(),
  ...StyleFields,
})

/** An already-registered image, placed by file id. */
export const ImageSpecSchema = z.object({
  kind: z.literal('image'),
  id: z.string().min(1).optional(),
  fileId: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().positive(),
  h: z.number().positive(),
  locked: z.boolean().default(true),
})

export const SpecSchema = z.discriminatedUnion('kind', [
  BoxSpecSchema,
  TextSpecSchema,
  ArrowSpecSchema,
  ImageSpecSchema,
])

export const SpecListSchema = z.array(SpecSchema).min(1).max(500)

export type Point = z.infer<typeof PointSchema>
export type Endpoint = z.infer<typeof EndpointSchema>
export type BoxSpec = z.infer<typeof BoxSpecSchema>
export type TextSpec = z.infer<typeof TextSpecSchema>
export type ArrowSpec = z.infer<typeof ArrowSpecSchema>
export type ImageSpec = z.infer<typeof ImageSpecSchema>
export type Spec = z.infer<typeof SpecSchema>

/** Narrow a spec's `kind` without a cast at every call site. */
export function isKind<K extends Spec['kind']>(
  spec: Spec,
  kind: K,
): spec is Extract<Spec, { kind: K }> {
  return spec.kind === kind
}

// ── Reading the scene back ───────────────────────────────────────────────────

/**
 * The compact shape an agent reads.
 *
 * Raw Excalidraw elements carry `seed`, `versionNonce`, `version`, `updated`,
 * `groupIds`, `frameId` and more. None of it helps a model reason and all of it
 * costs context: a 200-element scene serialises to tens of thousands of tokens
 * for perhaps two thousand tokens of meaning.
 */
export const SceneElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  /** Present for text elements and for shapes with a bound label. */
  text: z.string().optional(),
  /** Ids this element is bound to, for arrows. */
  from: z.string().optional(),
  to: z.string().optional(),
  locked: z.boolean().optional(),
  selected: z.boolean().optional(),
})

export type SceneElement = z.infer<typeof SceneElementSchema>

export const SceneQuerySchema = z.object({
  /** Restrict to these element types. */
  types: z.array(z.string()).optional(),
  /** Only elements intersecting this rectangle. */
  bounds: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number().positive(),
      h: z.number().positive(),
    })
    .optional(),
  /** Only what the human currently has selected. */
  selectedOnly: z.boolean().optional(),
  limit: z.number().int().positive().max(1000).default(200),
})

export type SceneQuery = z.infer<typeof SceneQuerySchema>

// ── Arranging ────────────────────────────────────────────────────────────────

export const ArrangeOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('align'),
    edge: z.enum(['left', 'right', 'top', 'bottom', 'centerX', 'centerY']),
  }),
  z.object({ op: z.literal('distribute'), axis: z.enum(['horizontal', 'vertical']) }),
  z.object({ op: z.literal('grid'), size: z.number().positive().default(8) }),
  z.object({
    op: z.literal('pack'),
    axis: z.enum(['horizontal', 'vertical']),
    gap: z.number().nonnegative().default(24),
  }),
])

export type ArrangeOp = z.infer<typeof ArrangeOpSchema>

import type { ArrowSpec, BoxSpec, Endpoint, ImageSpec, Spec, TextSpec } from '@paintai/protocol'
import type { Skeleton } from './types'

/**
 * Turning the agent's spec language into Excalidraw element skeletons.
 *
 * Upstream's `convertToExcalidrawElements` already does the genuinely hard part:
 * bound labels get the right `containerId` and the parent's `boundElements`
 * wired back, and arrows given `start`/`end` ids get real `startBinding` and
 * `endBinding` with sane focus and gap. Reimplementing that would be both
 * wasteful and worse.
 *
 * So this layer does the part upstream does not: it takes a spec language
 * narrow enough that a model gets it right, resolves references, and fills in
 * the defaults an agent should never have to think about. The output still goes
 * through `convertToExcalidrawElements` in the app.
 */

/** Stable-ish id when the agent did not supply one. */
function generateId(kind: string, index: number): string {
  return `${kind}_${index}_${Math.random().toString(36).slice(2, 8)}`
}

/** Style fields, omitted entirely when unset so canvas defaults win. */
function styleOf(spec: { [k: string]: unknown }): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof spec.stroke === 'string') out.strokeColor = spec.stroke
  if (typeof spec.background === 'string') out.backgroundColor = spec.background
  if (typeof spec.fill === 'string') out.fillStyle = spec.fill
  if (typeof spec.strokeWidth === 'number') out.strokeWidth = spec.strokeWidth
  if (typeof spec.strokeStyle === 'string') out.strokeStyle = spec.strokeStyle
  if (typeof spec.opacity === 'number') out.opacity = spec.opacity
  return out
}

function boxSkeleton(spec: BoxSpec, id: string): Skeleton {
  return {
    type: spec.shape,
    id,
    x: spec.x,
    y: spec.y,
    width: spec.w,
    height: spec.h,
    ...styleOf(spec),
    // A label here becomes a bound text element, not a floating one. That is
    // what keeps it attached when the shape is dragged or resized.
    ...(spec.label
      ? { label: { text: spec.label, ...(spec.fontSize ? { fontSize: spec.fontSize } : {}) } }
      : {}),
  }
}

function textSkeleton(spec: TextSpec, id: string): Skeleton {
  return {
    type: 'text',
    id,
    x: spec.x,
    y: spec.y,
    text: spec.text,
    ...(spec.fontSize ? { fontSize: spec.fontSize } : {}),
    ...(spec.stroke ? { strokeColor: spec.stroke } : {}),
    ...(typeof spec.opacity === 'number' ? { opacity: spec.opacity } : {}),
  }
}

function imageSkeleton(spec: ImageSpec, id: string): Skeleton {
  return {
    type: 'image',
    id,
    fileId: spec.fileId,
    x: spec.x,
    y: spec.y,
    width: spec.w,
    height: spec.h,
    locked: spec.locked,
  }
}

/** True when the endpoint points at another element rather than a coordinate. */
function isRef(endpoint: Endpoint): endpoint is { ref: string } {
  return 'ref' in endpoint
}

/**
 * Arrows, which are the only fiddly case.
 *
 * Bound ends are handed to upstream as `{ id }` and it computes the geometry.
 * Bare coordinates need explicit `points` relative to the element origin,
 * because an Excalidraw linear element stores its path as offsets from `x,y`
 * rather than as absolute positions.
 */
function arrowSkeleton(spec: ArrowSpec, id: string, resolve: (ref: string) => string): Skeleton {
  // Bound to locals so the type predicate narrows them. Narrowing does not
  // survive a property access, which is why these are not read off `spec`.
  const from = spec.from
  const to = spec.to

  const origin = isRef(from) ? { x: 0, y: 0 } : from

  const skeleton: Skeleton = {
    type: spec.style,
    id,
    x: origin.x,
    y: origin.y,
    ...styleOf(spec),
    ...(spec.label ? { label: { text: spec.label } } : {}),
  }

  if (isRef(from)) skeleton.start = { id: resolve(from.ref) }
  if (isRef(to)) skeleton.end = { id: resolve(to.ref) }

  // Only supply points when neither end is bound. Mixing explicit points with a
  // binding makes upstream fight itself over where the arrow should sit.
  if (!isRef(from) && !isRef(to)) {
    skeleton.points = [
      [0, 0],
      [to.x - from.x, to.y - from.y],
    ]
  }

  return skeleton
}

/**
 * Hydrate validated specs into skeletons.
 *
 * Runs in two passes because an arrow may reference a box declared after it.
 * Requiring declaration order would be an arbitrary rule for an agent to trip
 * over, and the fix is one extra loop.
 */
export function hydrate(specs: readonly Spec[]): Skeleton[] {
  const ids = new Map<string, string>()

  specs.forEach((spec, index) => {
    const id = spec.id ?? generateId(spec.kind, index)
    if (spec.id) ids.set(spec.id, id)
    ids.set(`__index_${index}`, id)
  })

  const resolve = (ref: string) => ids.get(ref) ?? ref

  return specs.map((spec, index) => {
    const id = ids.get(`__index_${index}`) as string

    switch (spec.kind) {
      case 'box':
        return boxSkeleton(spec, id)
      case 'text':
        return textSkeleton(spec, id)
      case 'image':
        return imageSkeleton(spec, id)
      case 'arrow':
        return arrowSkeleton(spec, id, resolve)
    }
  })
}

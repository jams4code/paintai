import type {
  ArrowSpec,
  BoxSpec,
  Endpoint,
  ImageSpec,
  Point,
  Spec,
  TextSpec,
} from '@paintai/protocol'
import type { Rect, Skeleton } from './types'

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

/**
 * Style for a bound label.
 *
 * A container's own `fontFamily` never reaches the text element upstream
 * creates from `label`, so it has to be passed into the label object. Without
 * this the shape obeys the canvas style and its caption does not.
 */
function labelStyle(defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (defaults.fontFamily !== undefined) out.fontFamily = defaults.fontFamily
  if (defaults.strokeColor !== undefined) out.strokeColor = defaults.strokeColor
  return out
}

function boxSkeleton(spec: BoxSpec, id: string, defaults: Record<string, unknown>): Skeleton {
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
      ? {
          label: {
            ...labelStyle(defaults),
            text: spec.label,
            ...(spec.fontSize ? { fontSize: spec.fontSize } : {}),
          },
        }
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
 * Turn an endpoint into an absolute scene coordinate.
 *
 * A bound endpoint resolves to the centre of whatever it points at. Excalidraw
 * clips the drawn path back to the shape's edge using the binding's gap, so
 * centre-to-centre is the correct input rather than an approximation.
 */
function endpointPoint(endpoint: Endpoint, geometry: Map<string, Rect>): Point | null {
  if (!isRef(endpoint)) return endpoint

  const rect = geometry.get(endpoint.ref)
  if (!rect) return null

  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

function arrowSkeleton(
  spec: ArrowSpec,
  id: string,
  resolve: (ref: string) => string,
  geometry: Map<string, Rect>,
  defaults: Record<string, unknown>,
): Skeleton {
  // Bound to locals so the type predicate narrows them. Narrowing does not
  // survive a property access, which is why these are not read off `spec`.
  const from = spec.from
  const to = spec.to

  const start = endpointPoint(from, geometry)
  const end = endpointPoint(to, geometry)
  const origin = start ?? { x: 0, y: 0 }

  const skeleton: Skeleton = {
    type: spec.style,
    id,
    x: origin.x,
    y: origin.y,
    ...styleOf(spec),
    ...(spec.label ? { label: { ...labelStyle(defaults), text: spec.label } } : {}),
  }

  if (isRef(from)) skeleton.start = { id: resolve(from.ref) }
  if (isRef(to)) skeleton.end = { id: resolve(to.ref) }

  // Points are always supplied, including for bound arrows.
  //
  // A binding says what the arrow is attached to; the points say where it is
  // drawn. They are separate, and omitting points leaves the arrow with the
  // default horizontal stub regardless of what it is bound to. That renders as
  // an arrow floating somewhere unrelated to the shapes it connects.
  if (end) {
    skeleton.points = [
      [0, 0],
      [end.x - origin.x, end.y - origin.y],
    ]
  }

  return skeleton
}

export interface HydrateOptions {
  /**
   * Style applied to every element before its own fields.
   *
   * Elements an agent creates should look like elements the user draws.
   * Excalidraw's own converter uses hardcoded defaults and ignores the canvas
   * style entirely, so without this an agent silently draws in a different
   * style from the person it is working with.
   */
  defaults?: Record<string, unknown>

  /**
   * Geometry of elements already on the canvas, so an arrow can be routed to
   * something that was not created in the same batch.
   */
  known?: Readonly<Record<string, Rect>>
}

/**
 * Hydrate validated specs into skeletons.
 *
 * Runs in two passes because an arrow may reference a box declared after it.
 * Requiring declaration order would be an arbitrary rule for an agent to trip
 * over, and the fix is one extra loop.
 */
export function hydrate(specs: readonly Spec[], options: HydrateOptions = {}): Skeleton[] {
  const ids = new Map<string, string>()
  const geometry = new Map<string, Rect>(Object.entries(options.known ?? {}))

  specs.forEach((spec, index) => {
    const id = spec.id ?? generateId(spec.kind, index)
    if (spec.id) ids.set(spec.id, id)
    ids.set(`__index_${index}`, id)

    // Only shapes and images have geometry an arrow can aim at.
    if (spec.id && (spec.kind === 'box' || spec.kind === 'image')) {
      geometry.set(spec.id, { x: spec.x, y: spec.y, w: spec.w, h: spec.h })
    }
  })

  const resolve = (ref: string) => ids.get(ref) ?? ref
  const defaults = options.defaults ?? {}

  return specs.map((spec, index) => {
    const id = ids.get(`__index_${index}`) as string

    const skeleton = (() => {
      switch (spec.kind) {
        case 'box':
          return boxSkeleton(spec, id, defaults)
        case 'text':
          return textSkeleton(spec, id)
        case 'image':
          return imageSkeleton(spec, id)
        case 'arrow':
          return arrowSkeleton(spec, id, resolve, geometry, defaults)
      }
    })()

    // Defaults first so anything the spec set explicitly still wins. Images are
    // bitmaps, so roughness and fonts mean nothing to them.
    return spec.kind === 'image' ? skeleton : { ...defaults, ...skeleton }
  })
}

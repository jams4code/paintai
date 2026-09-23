/**
 * Structural types, defined here rather than imported from Excalidraw.
 *
 * `scene-ops` is the domain core and depends on nothing. Importing Excalidraw
 * would drag a DOM-dependent package into a module that has to run in plain
 * Node, and would couple the contract to their release cycle. These describe
 * only the fields this package actually touches, so anything shaped like an
 * Excalidraw element satisfies them.
 */

/** The subset of a raw Excalidraw element that this package reads. */
export interface RawElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  locked?: boolean
  text?: string
  containerId?: string | null
  boundElements?: readonly { id: string; type: string }[] | null
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
}

/**
 * An Excalidraw element skeleton.
 *
 * Loosely typed on purpose: this is the input to upstream's
 * `convertToExcalidrawElements`, which owns the real shape. Pinning it exactly
 * would mean tracking their type changes for no benefit, since the caller type
 * checks it at the boundary anyway.
 */
export interface Skeleton {
  type: string
  x: number
  y: number
  [key: string]: unknown
}

/** A position change produced by an arrange operation. */
export interface Move {
  id: string
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Axis-aligned bounds of a set of elements. Null when the set is empty. */
export function boundsOf(elements: readonly { x: number; y: number; w: number; h: number }[]) {
  if (elements.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.w)
    maxY = Math.max(maxY, el.y + el.h)
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

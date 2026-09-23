import type { ArrangeOp, SceneElement } from '@paintai/protocol'
import { boundsOf, type Move } from './types'

/**
 * Tidying geometry.
 *
 * Less glamorous than generating a diagram and used far more often. Returns
 * moves rather than mutating, so the caller decides what to do with them and
 * the whole batch lands as one undo step.
 */

function alignMoves(elements: readonly SceneElement[], edge: string): Move[] {
  const bounds = boundsOf(elements)
  if (!bounds) return []

  return elements.map((el) => {
    switch (edge) {
      case 'left':
        return { id: el.id, x: bounds.x, y: el.y }
      case 'right':
        return { id: el.id, x: bounds.x + bounds.w - el.w, y: el.y }
      case 'top':
        return { id: el.id, x: el.x, y: bounds.y }
      case 'bottom':
        return { id: el.id, x: el.x, y: bounds.y + bounds.h - el.h }
      case 'centerX':
        return { id: el.id, x: bounds.x + (bounds.w - el.w) / 2, y: el.y }
      case 'centerY':
        return { id: el.id, x: el.x, y: bounds.y + (bounds.h - el.h) / 2 }
      default:
        return { id: el.id, x: el.x, y: el.y }
    }
  })
}

/**
 * Even gaps between elements, outermost two held in place.
 *
 * Distributing by *gap* rather than by centre is the behaviour people actually
 * want. Equal centres look wrong the moment two elements are different sizes,
 * which in a wireframe they always are.
 */
function distributeMoves(
  elements: readonly SceneElement[],
  axis: 'horizontal' | 'vertical',
): Move[] {
  if (elements.length < 3) return []

  const horizontal = axis === 'horizontal'
  const sorted = [...elements].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))

  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  const span = horizontal ? last.x + last.w - first.x : last.y + last.h - first.y
  const occupied = sorted.reduce((sum, el) => sum + (horizontal ? el.w : el.h), 0)
  const gap = (span - occupied) / (sorted.length - 1)

  const moves: Move[] = []
  let cursor = horizontal ? first.x : first.y

  for (const el of sorted) {
    moves.push(horizontal ? { id: el.id, x: cursor, y: el.y } : { id: el.id, x: el.x, y: cursor })
    cursor += (horizontal ? el.w : el.h) + gap
  }

  return moves
}

function gridMoves(elements: readonly SceneElement[], size: number): Move[] {
  const snap = (n: number) => Math.round(n / size) * size
  return elements.map((el) => ({ id: el.id, x: snap(el.x), y: snap(el.y) }))
}

/** Stack elements in order with a fixed gap, anchored at the current bounds. */
function packMoves(
  elements: readonly SceneElement[],
  axis: 'horizontal' | 'vertical',
  gap: number,
): Move[] {
  const bounds = boundsOf(elements)
  if (!bounds) return []

  const horizontal = axis === 'horizontal'
  const sorted = [...elements].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))

  const moves: Move[] = []
  let cursor = horizontal ? bounds.x : bounds.y

  for (const el of sorted) {
    moves.push(
      horizontal ? { id: el.id, x: cursor, y: bounds.y } : { id: el.id, x: bounds.x, y: cursor },
    )
    cursor += (horizontal ? el.w : el.h) + gap
  }

  return moves
}

/** Apply an arrange operation, returning only the elements that actually move. */
export function arrange(elements: readonly SceneElement[], op: ArrangeOp): Move[] {
  if (elements.length === 0) return []

  const moves = (() => {
    switch (op.op) {
      case 'align':
        return alignMoves(elements, op.edge)
      case 'distribute':
        return distributeMoves(elements, op.axis)
      case 'grid':
        return gridMoves(elements, op.size)
      case 'pack':
        return packMoves(elements, op.axis, op.gap)
    }
  })()

  // Emitting no-op moves would bump every element's version and make an undo
  // step out of nothing.
  const before = new Map(elements.map((el) => [el.id, el]))
  return moves.filter((move) => {
    const original = before.get(move.id)
    if (!original) return false
    return Math.abs(original.x - move.x) > 0.01 || Math.abs(original.y - move.y) > 0.01
  })
}

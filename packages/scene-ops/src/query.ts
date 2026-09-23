import type { SceneElement, SceneQuery } from '@paintai/protocol'
import type { RawElement } from './types'

/**
 * Reading the scene back for an agent.
 *
 * Token cost is a hard constraint, not a nicety. A raw Excalidraw element
 * carries `seed`, `version`, `versionNonce`, `updated`, `groupIds`, `frameId`,
 * `roundness`, and a dozen style fields. None of it helps a model reason about
 * a diagram, and a 200-element scene serialises to tens of thousands of tokens
 * for maybe two thousand tokens of meaning. This throws all of it away.
 */

/** Text bound to a shape lives in a separate element pointing back by id. */
function labelIndex(elements: readonly RawElement[]): Map<string, string> {
  const labels = new Map<string, string>()
  for (const el of elements) {
    if (el.type === 'text' && el.containerId && el.text) {
      labels.set(el.containerId, el.text)
    }
  }
  return labels
}

function intersects(el: RawElement, bounds: NonNullable<SceneQuery['bounds']>): boolean {
  return (
    el.x < bounds.x + bounds.w &&
    el.x + el.width > bounds.x &&
    el.y < bounds.y + bounds.h &&
    el.y + el.height > bounds.y
  )
}

/**
 * Project raw elements into the compact form.
 *
 * Bound label text is folded into its parent rather than emitted as a separate
 * element, because "a box that says Submit" is one thing to a reader and two
 * things to Excalidraw. Emitting both doubles the element count and invites an
 * agent to move a label independently of the shape it belongs to.
 */
export function toSceneElements(
  elements: readonly RawElement[],
  selectedIds: Readonly<Record<string, boolean>> = {},
  query?: Partial<SceneQuery>,
): SceneElement[] {
  const labels = labelIndex(elements)
  const out: SceneElement[] = []
  const limit = query?.limit ?? 200

  for (const el of elements) {
    if (el.isDeleted) continue

    // Bound labels are folded into their container above.
    if (el.type === 'text' && el.containerId) continue

    if (query?.types && !query.types.includes(el.type)) continue
    if (query?.bounds && !intersects(el, query.bounds)) continue
    if (query?.selectedOnly && !selectedIds[el.id]) continue

    const text = el.type === 'text' ? el.text : labels.get(el.id)

    out.push({
      id: el.id,
      type: el.type,
      x: Math.round(el.x),
      y: Math.round(el.y),
      w: Math.round(el.width),
      h: Math.round(el.height),
      ...(text ? { text } : {}),
      ...(el.startBinding ? { from: el.startBinding.elementId } : {}),
      ...(el.endBinding ? { to: el.endBinding.elementId } : {}),
      ...(el.locked ? { locked: true } : {}),
      ...(selectedIds[el.id] ? { selected: true } : {}),
    })

    if (out.length >= limit) break
  }

  return out
}

/** One-line summary for when even the compact projection is too much. */
export function describeScene(elements: readonly SceneElement[]): string {
  if (elements.length === 0) return 'empty canvas'

  const counts = new Map<string, number>()
  for (const el of elements) counts.set(el.type, (counts.get(el.type) ?? 0) + 1)

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${type}${n === 1 ? '' : 's'}`)

  return parts.join(', ')
}

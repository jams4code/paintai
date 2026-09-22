import { describe, expect, it } from 'vitest'
import { resolveImagePlacement, type Viewport } from './placement'

/**
 * Geometry tests for the image placement policy.
 *
 * These cover the parts that should hold whichever of the three policies you
 * pick: an image never overflows the area it is placed into, it never scales
 * up, and the numbers it returns are usable. The two policy assertions at the
 * bottom are marked, because those are the ones that change when you rewrite
 * the function.
 */

const viewport: Viewport = { x: 0, y: 0, width: 1000, height: 800 }

describe('resolveImagePlacement', () => {
  it('scales a large image down to fit inside the viewport', () => {
    const placed = resolveImagePlacement(
      { naturalWidth: 4000, naturalHeight: 3000 },
      viewport,
      false,
    )

    expect(placed.width).toBeLessThanOrEqual(viewport.width)
    expect(placed.height).toBeLessThanOrEqual(viewport.height)
  })

  it('preserves aspect ratio', () => {
    const placed = resolveImagePlacement(
      { naturalWidth: 4000, naturalHeight: 3000 },
      viewport,
      false,
    )

    expect(placed.width / placed.height).toBeCloseTo(4000 / 3000, 5)
  })

  it('never scales an image up', () => {
    const placed = resolveImagePlacement({ naturalWidth: 32, naturalHeight: 32 }, viewport, false)

    expect(placed.width).toBe(32)
    expect(placed.height).toBe(32)
  })

  it('centres the image in the viewport', () => {
    const placed = resolveImagePlacement({ naturalWidth: 500, naturalHeight: 400 }, viewport, false)

    expect(placed.x + placed.width / 2).toBeCloseTo(viewport.x + viewport.width / 2, 5)
    expect(placed.y + placed.height / 2).toBeCloseTo(viewport.y + viewport.height / 2, 5)
  })

  it('respects a scrolled viewport rather than assuming the origin', () => {
    const scrolled: Viewport = { x: -2400, y: 1750, width: 1000, height: 800 }
    const placed = resolveImagePlacement({ naturalWidth: 200, naturalHeight: 200 }, scrolled, false)

    expect(placed.x).toBeGreaterThanOrEqual(scrolled.x)
    expect(placed.x + placed.width).toBeLessThanOrEqual(scrolled.x + scrolled.width)
    expect(placed.y).toBeGreaterThanOrEqual(scrolled.y)
    expect(placed.y + placed.height).toBeLessThanOrEqual(scrolled.y + scrolled.height)
  })

  it('handles a viewport narrower than it is tall', () => {
    const tall: Viewport = { x: 0, y: 0, width: 400, height: 1200 }
    const placed = resolveImagePlacement({ naturalWidth: 2000, naturalHeight: 1000 }, tall, false)

    expect(placed.width).toBeLessThanOrEqual(tall.width)
    expect(placed.height).toBeLessThanOrEqual(tall.height)
  })

  it('returns finite, positive geometry for a degenerate image', () => {
    const placed = resolveImagePlacement({ naturalWidth: 1, naturalHeight: 1 }, viewport, false)

    for (const n of [placed.x, placed.y, placed.width, placed.height]) {
      expect(Number.isFinite(n)).toBe(true)
    }
    expect(placed.width).toBeGreaterThan(0)
    expect(placed.height).toBeGreaterThan(0)
  })

  // ── Policy assertions. These are what change when you rewrite the function. ──

  it('locks placed images so drawing on top does not drag them', () => {
    const placed = resolveImagePlacement({ naturalWidth: 800, naturalHeight: 600 }, viewport, false)

    expect(placed.locked).toBe(true)
  })

  it('keeps existing scene content when a second image arrives', () => {
    const placed = resolveImagePlacement({ naturalWidth: 800, naturalHeight: 600 }, viewport, true)

    // Flip this to `true` if you choose the REPLACE policy.
    expect(placed.clearScene).toBe(false)
  })
})

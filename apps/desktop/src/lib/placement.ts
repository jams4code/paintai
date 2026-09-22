/**
 * Where an incoming image lands on the canvas.
 *
 * This module is pure. It imports nothing, touches no DOM, and knows nothing
 * about Excalidraw. That is deliberate: it is the only part of Phase 1 that
 * encodes a product decision rather than plumbing, so it is the part that has
 * to be testable without a browser. It is also a small preview of what
 * `packages/scene-ops` becomes in Phase 2.
 */

export interface Viewport {
  /** Scene coordinates of the top-left of what the user can currently see. */
  x: number
  y: number
  /** Size of the visible area in scene units, already divided by zoom. */
  width: number
  height: number
}

export interface IncomingImage {
  naturalWidth: number
  naturalHeight: number
}

export interface Placement {
  x: number
  y: number
  width: number
  height: number
  /** Whether existing scene content should be cleared before placing. */
  clearScene: boolean
  /** Locked images do not get grabbed when you draw on top of them. */
  locked: boolean
}

/** Fraction of the viewport an image is allowed to fill. Leaves breathing room. */
const VIEWPORT_FILL = 0.9

/**
 * Decide where an incoming image lands and what happens to what is already there.
 *
 * ── THE DECISION, AND IT IS YOURS ────────────────────────────────────────────
 *
 * The body below implements "fit to viewport, keep what is already there, lock
 * the image". It works, but it is only one of three defensible answers, and the
 * one you pick defines what this application *is*:
 *
 *   1. REPLACE       Clear the scene. PaintAI behaves like Paint: one image at
 *                    a time, annotations belong to that image, a new paste is a
 *                    new job. Predictable, and it matches how people actually
 *                    annotate: paste, mark, copy, done. Costs you the ability
 *                    to put two screenshots side by side.
 *
 *   2. ALONGSIDE     Place clear of existing content, keep everything. PaintAI
 *                    becomes an infinite canvas where screenshots accumulate.
 *                    Good for comparing three states of a bug. But someone who
 *                    pastes twice expecting a fresh start now has a mess, and
 *                    "export" turns ambiguous when the canvas holds several
 *                    unrelated things.
 *
 *   3. FIT-VIEWPORT  What is written below. Scale into the visible area, keep
 *                    existing content, centre it on screen. Splits the
 *                    difference, and is arguably the most confusing of the
 *                    three because the result depends on where the user
 *                    happened to have scrolled.
 *
 * Second axis, independent of the first: should `locked` be true? Locking stops
 * the image being selected and dragged when someone meant to draw an arrow on
 * it, which is the single most common annoyance in every annotation tool. The
 * cost is that moving it on purpose needs an unlock first.
 *
 * Rewrite this function with the behaviour you want. `sceneHasContent` is
 * already wired through for you, the tests in `placement.test.ts` cover the
 * geometry, and nothing else in the app cares which of the three you pick.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function resolveImagePlacement(
  image: IncomingImage,
  viewport: Viewport,
  sceneHasContent: boolean,
): Placement {
  // Default: fit-viewport. Replace this body.
  void sceneHasContent

  // Never scale up. A 32px icon blown across the screen helps nobody, and the
  // user can always resize once it is placed.
  const scale = Math.min(
    (viewport.width * VIEWPORT_FILL) / image.naturalWidth,
    (viewport.height * VIEWPORT_FILL) / image.naturalHeight,
    1,
  )

  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale

  return {
    x: viewport.x + (viewport.width - width) / 2,
    y: viewport.y + (viewport.height - height) / 2,
    width,
    height,
    clearScene: false,
    locked: true,
  }
}

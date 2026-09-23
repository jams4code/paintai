import { FONT_FAMILY, ROUNDNESS, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

/**
 * Canvas drawing style.
 *
 * Excalidraw renders every shape through roughjs, which deliberately adds
 * wobble to imitate a hand drawing, and pairs it with a handwriting typeface.
 * That is the right default for a whiteboard. It is the wrong default for
 * marking up a screenshot you are about to send a client, where it reads as
 * unserious no matter how good the annotation is.
 *
 * So the style is a first-class choice rather than a buried setting, and the
 * professional one is the default.
 */

export type StyleName = 'precise' | 'sketch'

/** roughjs wobble. Excalidraw calls these architect, artist, cartoonist. */
const ROUGHNESS = { architect: 0, artist: 1 } as const

interface CanvasStyle {
  label: string
  /** Defaults applied to anything drawn from now on. */
  appState: {
    currentItemRoughness: number
    currentItemFillStyle: 'solid' | 'hachure'
    currentItemFontFamily: number
    currentItemStrokeWidth: number
    currentItemRoundness: 'round' | 'sharp'
  }
  /** Applied when restyling what is already on the canvas. */
  element: {
    roughness: number
    fillStyle: 'solid' | 'hachure'
    fontFamily: number
    roundness: { type: number } | null
  }
}

export const STYLES: Record<StyleName, CanvasStyle> = {
  /**
   * Crisp geometry, solid fills, a real sans. Circles are circles and squares
   * have square corners. This is what an annotation on a client screenshot
   * should look like.
   */
  precise: {
    label: 'Precise',
    appState: {
      currentItemRoughness: ROUGHNESS.architect,
      currentItemFillStyle: 'solid',
      currentItemFontFamily: FONT_FAMILY.Nunito,
      currentItemStrokeWidth: 2,
      currentItemRoundness: 'sharp',
    },
    element: {
      roughness: ROUGHNESS.architect,
      fillStyle: 'solid',
      fontFamily: FONT_FAMILY.Nunito,
      roundness: null,
    },
  },

  /**
   * Excalidraw's own look, kept on purpose. Deliberate roughness is genuinely
   * useful on a mockup: it signals "this is a draft" and stops a reviewer
   * arguing about pixel spacing on something that was never meant to be final.
   * That is a real technique, not a limitation. It just should not be forced on
   * someone annotating a bug report.
   */
  sketch: {
    label: 'Sketch',
    appState: {
      currentItemRoughness: ROUGHNESS.artist,
      currentItemFillStyle: 'hachure',
      currentItemFontFamily: FONT_FAMILY.Excalifont,
      currentItemStrokeWidth: 2,
      currentItemRoundness: 'round',
    },
    element: {
      roughness: ROUGHNESS.artist,
      fillStyle: 'hachure',
      fontFamily: FONT_FAMILY.Excalifont,
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
    },
  },
}

/** Elements whose corners can be rounded. Ellipses and lines have no corners. */
const ROUNDABLE = new Set(['rectangle', 'diamond'])

/**
 * Restyle everything already on the canvas.
 *
 * Switching style only changing *future* shapes would be useless: the whole
 * point is fixing a diagram that came out looking sloppy. Images are left
 * alone, since roughness means nothing to a bitmap.
 */
export function restyleElements(
  elements: readonly ExcalidrawElement[],
  name: StyleName,
): ExcalidrawElement[] {
  const style = STYLES[name].element

  return elements.map((element) => {
    if (element.type === 'image' || element.isDeleted) return element

    const updates: Record<string, unknown> = {
      roughness: style.roughness,
      fillStyle: style.fillStyle,
    }

    if (element.type === 'text') {
      updates.fontFamily = style.fontFamily
    }

    if (ROUNDABLE.has(element.type)) {
      updates.roundness = style.roundness
    }

    return newElementWith(element, updates)
  })
}

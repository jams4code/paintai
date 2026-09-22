import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { resolveImagePlacement, type IncomingImage, type Viewport } from './placement'

/**
 * Putting a real image onto the canvas.
 *
 * Everything here is mechanical. The one decision that matters lives in
 * `placement.ts`, which is pure and has no idea Excalidraw exists.
 */

/** Read an image's intrinsic size. Handles SVG, which `createImageBitmap` does not. */
export function measureImage(dataURL: string): Promise<IncomingImage> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () =>
      resolve({
        // An SVG with no intrinsic size reports 0. Give it something sane
        // rather than placing a zero-area element the user cannot select.
        naturalWidth: img.naturalWidth || 512,
        naturalHeight: img.naturalHeight || 512,
      })
    img.onerror = () => reject(new Error('could not decode image'))
    img.src = dataURL
  })
}

/** Current viewport in scene coordinates, derived from scroll and zoom. */
export function currentViewport(api: ExcalidrawImperativeAPI): Viewport {
  const state = api.getAppState()
  const zoom = state.zoom.value || 1
  return {
    x: -state.scrollX,
    y: -state.scrollY,
    width: state.width / zoom,
    height: state.height / zoom,
  }
}

/**
 * Place an image on the canvas.
 *
 * Registers the binary with Excalidraw's file store, then adds an element that
 * references it by id. Images are stored once and referenced, so the same
 * screenshot placed twice costs one copy of the bytes.
 */
export async function insertImage(
  api: ExcalidrawImperativeAPI,
  dataURL: string,
  mimeType: string,
): Promise<void> {
  const measured = await measureImage(dataURL)
  const existing = api.getSceneElements()
  const placement = resolveImagePlacement(measured, currentViewport(api), existing.length > 0)

  const fileId = crypto.randomUUID()

  api.addFiles([
    {
      id: fileId as never,
      dataURL: dataURL as never,
      mimeType: mimeType as never,
      created: Date.now(),
    },
  ])

  // convertToExcalidrawElements fills in seed, versionNonce and the rest of the
  // fields a valid element needs. This is upstream's own hydration layer, and
  // exactly the pattern packages/scene-ops generalises in Phase 2.
  const element = convertToExcalidrawElements([
    {
      type: 'image',
      fileId: fileId as never,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      locked: placement.locked,
    },
  ])

  api.updateScene({
    elements: placement.clearScene ? element : [...existing, ...element],
    captureUpdate: 'IMMEDIATELY' as never,
  })
}

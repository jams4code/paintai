import { exportToBlob } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { writeImage } from '@tauri-apps/plugin-clipboard-manager'
import { pickSaveTarget, writeFile } from './files'

/**
 * Getting pixels out of the canvas.
 *
 * The clipboard path matters more than the file path. Annotating a screenshot
 * and saving it to Downloads so you can drag it back into a chat window is the
 * workflow this application exists to delete, so copy-to-clipboard has to be
 * one keystroke and it has to include what the user expects.
 */

export type ExportScale = 1 | 2 | 3

/**
 * What gets exported.
 *
 * If the user has selected something, they mean that thing. If they have not,
 * they mean the whole canvas. This is the behaviour every graphics tool has
 * trained people to expect, and getting it wrong is immediately infuriating.
 */
function exportableElements(api: ExcalidrawImperativeAPI) {
  const all = api.getSceneElements()
  const selectedIds = api.getAppState().selectedElementIds
  const selected = all.filter((el) => selectedIds[el.id])
  return selected.length > 0 ? selected : all
}

async function renderPNG(api: ExcalidrawImperativeAPI, scale: ExportScale): Promise<Blob> {
  const elements = exportableElements(api)
  if (elements.length === 0) {
    throw new Error('Nothing to export. The canvas is empty.')
  }

  const appState = api.getAppState()

  return exportToBlob({
    elements,
    files: api.getFiles(),
    mimeType: 'image/png',
    appState: {
      exportBackground: appState.exportBackground,
      viewBackgroundColor: appState.viewBackgroundColor,
      exportWithDarkMode: appState.exportWithDarkMode,
    },
    exportPadding: 16,
    // Explicit rather than leaning on appState.exportScale, so the scale the
    // user asked for is the scale that comes out regardless of stored state.
    getDimensions: (width: number, height: number) => ({
      width: width * scale,
      height: height * scale,
      scale,
    }),
  })
}

/** Copy the canvas, or the selection, to the system clipboard as a PNG. */
export async function copyToClipboard(api: ExcalidrawImperativeAPI): Promise<void> {
  const blob = await renderPNG(api, 2)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  await writeImage(bytes)
}

/** Export to a PNG file the user picks. Returns the path, or null if cancelled. */
export async function exportPNG(
  api: ExcalidrawImperativeAPI,
  scale: ExportScale,
): Promise<string | null> {
  const blob = await renderPNG(api, scale)

  const suffix = scale === 1 ? '' : `@${scale}x`
  const target = await pickSaveTarget(`paintai-export${suffix}.png`, ['png'])
  if (!target) return null

  await writeFile(target, new Uint8Array(await blob.arrayBuffer()))
  return target
}

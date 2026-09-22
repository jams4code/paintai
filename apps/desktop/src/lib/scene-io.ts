import { loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { pickSaveTarget, pickSceneToOpen, readFile, writeFile } from './files'

/**
 * Reading and writing `.excalidraw` scene files.
 *
 * The format is plain Excalidraw JSON on purpose. A PaintAI scene opens in
 * excalidraw.com and an Excalidraw scene opens here. Inventing a proprietary
 * container would buy nothing and would strand anyone who stops using this.
 */

/** Save the current scene. Returns the path written, or null if cancelled. */
export async function saveScene(
  api: ExcalidrawImperativeAPI,
  existingPath: string | null,
): Promise<string | null> {
  const target = existingPath ?? (await pickSaveTarget('untitled.excalidraw', ['excalidraw']))
  if (!target) return null

  const json = serializeAsJSON(
    api.getSceneElements(),
    api.getAppState(),
    api.getFiles(),
    // "local" embeds the image binaries in the file. The alternative assumes a
    // server to fetch them from, and there is no server.
    'local',
  )

  await writeFile(target, new TextEncoder().encode(json))
  return target
}

/** Open a scene, replacing what is on the canvas. Returns the path, or null. */
export async function openScene(api: ExcalidrawImperativeAPI): Promise<string | null> {
  const path = await pickSceneToOpen()
  if (!path) return null

  const bytes = await readFile(path)
  const blob = new Blob([bytes as BlobPart], { type: 'application/json' })

  const scene = await loadFromBlob(blob, null, null)

  api.updateScene({
    elements: scene.elements,
    appState: scene.appState,
    captureUpdate: 'IMMEDIATELY' as never,
  })

  if (scene.files) {
    api.addFiles(Object.values(scene.files))
  }

  return path
}

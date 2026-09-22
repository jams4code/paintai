import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'

/**
 * Thin wrappers over the two Rust filesystem commands and the native dialogs.
 *
 * Nothing here decides *what* to read or write. Callers pick a path through a
 * dialog, and the Rust side canonicalises it before touching the disk. Keeping
 * this module dumb is deliberate: it is the only place the renderer can reach
 * the filesystem, so it should be small enough to audit in one sitting.
 */

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] as const

/** MIME type for an image path, or null when the extension is not one we place. */
export function imageMimeType(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'svg':
      return 'image/svg+xml'
    default:
      return null
  }
}

/** Read a file the user selected. Resolves to raw bytes. */
export async function readFile(path: string): Promise<Uint8Array> {
  const bytes = await invoke<ArrayBuffer>('read_file', { path })
  return new Uint8Array(bytes)
}

/** Write bytes to a path the user selected. */
export async function writeFile(path: string, contents: Uint8Array): Promise<void> {
  await invoke('write_file', { path, contents: Array.from(contents) })
}

/** Native open dialog for a scene file. Null when the user cancels. */
export function pickSceneToOpen(): Promise<string | null> {
  return open({
    multiple: false,
    directory: false,
    filters: [{ name: 'PaintAI scene', extensions: ['excalidraw', 'json'] }],
  }) as Promise<string | null>
}

/** Native open dialog for one or more images. Empty when the user cancels. */
export async function pickImagesToOpen(): Promise<string[]> {
  const picked = await open({
    multiple: true,
    directory: false,
    filters: [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS] }],
  })
  if (!picked) return []
  return Array.isArray(picked) ? picked : [picked]
}

/** Native save dialog. Null when the user cancels. */
export function pickSaveTarget(defaultName: string, extensions: string[]): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: extensions[0].toUpperCase(), extensions }],
  })
}

/** Turn raw bytes into the data URL Excalidraw stores images as. */
export function toDataURL(bytes: Uint8Array, mimeType: string): string {
  // Chunked because String.fromCharCode(...bytes) blows the call stack on
  // anything over roughly 100KB, and screenshots are comfortably past that.
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'

import { TitleBar } from './components/TitleBar'
import { imageMimeType, pickImagesToOpen, readFile, toDataURL } from './lib/files'
import { insertImage } from './lib/image-insert'
import { copyToClipboard, exportPNG, type ExportScale } from './lib/export'
import { openScene, saveScene } from './lib/scene-io'
import { restyleElements, STYLES, type StyleName } from './lib/style'
import './App.css'

/** Toast lifetime. Long enough to read a path, short enough not to nag. */
const STATUS_MS = 2600

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [scale, setScale] = useState<ExportScale>(2)
  const [style, setStyle] = useState<StyleName>('precise')
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)

  const say = useCallback((text: string, error = false) => {
    setStatus({ text, error })
    window.setTimeout(() => setStatus(null), STATUS_MS)
  }, [])

  /** Run an action, surfacing failures instead of swallowing them. */
  const run = useCallback(
    async (label: string, fn: (api: ExcalidrawImperativeAPI) => Promise<string | void | null>) => {
      const api = apiRef.current
      if (!api) return
      try {
        const result = await fn(api)
        if (result === null) return // user cancelled a dialog, say nothing
        say(typeof result === 'string' ? `${label}: ${result}` : label)
      } catch (err) {
        say(err instanceof Error ? err.message : `${label} failed`, true)
      }
    },
    [say],
  )

  const doCopy = useCallback(
    () => run('Copied to clipboard', async (api) => void (await copyToClipboard(api))),
    [run],
  )

  const doExport = useCallback(() => run('Exported', (api) => exportPNG(api, scale)), [run, scale])

  const doSave = useCallback(
    () =>
      run('Saved', async (api) => {
        const written = await saveScene(api, path)
        if (written) {
          setPath(written)
          setDirty(false)
        }
        return written
      }),
    [run, path],
  )

  const doOpenScene = useCallback(
    () =>
      run('Opened', async (api) => {
        const opened = await openScene(api)
        if (opened) {
          setPath(opened)
          setDirty(false)
        }
        return opened
      }),
    [run],
  )

  const doOpenImage = useCallback(
    () =>
      run('Placed image', async (api) => {
        const picked = await pickImagesToOpen()
        if (picked.length === 0) return null
        for (const file of picked) {
          const mime = imageMimeType(file)
          if (!mime) continue
          await insertImage(api, toDataURL(await readFile(file), mime), mime)
        }
        return null
      }),
    [run],
  )

  /**
   * Images arriving by paste or drop.
   *
   * Excalidraw handles both natively, but its placement is its own. These
   * listeners run in the capture phase and stop propagation so an incoming
   * image goes through resolveImagePlacement instead, which is where the
   * lock-by-default and sizing behaviour lives. Anything that is not an image
   * falls through untouched, so pasting text or Excalidraw elements still works.
   */
  useEffect(() => {
    async function place(file: File) {
      const api = apiRef.current
      if (!api) return
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        await insertImage(api, toDataURL(bytes, file.type), file.type)
      } catch (err) {
        say(err instanceof Error ? err.message : 'Could not place image', true)
      }
    }

    function onPaste(event: ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (!file) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void place(file)
    }

    function onDrop(event: DragEvent) {
      const images = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      )
      if (images.length === 0) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void (async () => {
        for (const file of images) await place(file)
      })()
    }

    function onDragOver(event: DragEvent) {
      if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault()
    }

    window.addEventListener('paste', onPaste, true)
    window.addEventListener('drop', onDrop, true)
    window.addEventListener('dragover', onDragOver, true)
    return () => {
      window.removeEventListener('paste', onPaste, true)
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragover', onDragOver, true)
    }
  }, [say])

  /** Shortcuts. Registered in capture so Excalidraw's own bindings do not win. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()

      const action =
        key === 'c' && event.shiftKey
          ? doCopy
          : key === 's' && !event.shiftKey
            ? doSave
            : key === 'o'
              ? doOpenScene
              : key === 'e'
                ? doExport
                : key === 'i'
                  ? doOpenImage
                  : null

      if (!action) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void action()
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [doCopy, doSave, doOpenScene, doExport, doOpenImage])

  /**
   * Switch drawing style, and restyle what is already on the canvas.
   *
   * Only changing future shapes would miss the point: the reason you reach for
   * this is that the diagram in front of you came out looking wrong.
   */
  const applyStyle = useCallback((name: StyleName) => {
    setStyle(name)
    const api = apiRef.current
    if (!api) return
    api.updateScene({
      elements: restyleElements(api.getSceneElements(), name),
      appState: STYLES[name].appState,
      captureUpdate: 'IMMEDIATELY' as never,
    })
  }, [])

  const fileName = path ? (path.split(/[\\/]/).pop() ?? 'untitled') : 'untitled'

  return (
    <div className="app">
      <TitleBar
        fileName={fileName}
        dirty={dirty}
        scale={scale}
        onScaleChange={setScale}
        style={style}
        onStyleChange={applyStyle}
        onOpenImage={doOpenImage}
        onOpenScene={doOpenScene}
        onSave={doSave}
        onExport={doExport}
        onCopy={doCopy}
      />

      <div className="canvas">
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api
          }}
          onChange={() => {
            if (!dirty) setDirty(true)
          }}
          initialData={{
            appState: { viewBackgroundColor: '#ffffff', ...STYLES.precise.appState },
          }}
        />
      </div>

      {status && (
        <div className={status.error ? 'status error' : 'status'} role="status">
          {status.text}
        </div>
      )}
    </div>
  )
}

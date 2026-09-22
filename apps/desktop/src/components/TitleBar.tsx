import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ExportScale } from '../lib/export'

/**
 * The window is frameless, so this bar is both chrome and toolbar.
 *
 * One bar instead of two is deliberate. An annotation tool gets used beside
 * other windows, often on half a screen, and every row of chrome is a row of
 * canvas you do not have.
 */

interface Props {
  fileName: string
  dirty: boolean
  scale: ExportScale
  onScaleChange: (scale: ExportScale) => void
  onOpenImage: () => void
  onOpenScene: () => void
  onSave: () => void
  onExport: () => void
  onCopy: () => void
}

const win = getCurrentWindow()

export function TitleBar(props: Props) {
  const [pinned, setPinned] = useState(false)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    win
      .isMaximized()
      .then(setMaximized)
      .catch(() => {})
    const unlisten = win.onResized(() => {
      win
        .isMaximized()
        .then(setMaximized)
        .catch(() => {})
    })
    return () => {
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [])

  async function togglePin() {
    const next = !pinned
    await win.setAlwaysOnTop(next)
    setPinned(next)
  }

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <svg width="16" height="16" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M44 37V18C44 2 12 2 12 18V47C12 59 24 59 24 47V22C24 14 36 14 36 22V30C36 38 30 38 24 38" />
            <path d="M44 37L54 28" />
          </g>
          <path fill="#00B8A9" d="M52 27C51 23 55 19 61 17C60 21 64 24 59 28C57 30 54 30 52 27Z" />
        </svg>
        <span className="titlebar-file">
          {props.fileName}
          {props.dirty ? ' •' : ''}
        </span>
      </div>

      <div className="titlebar-actions">
        <button onClick={props.onOpenImage} title="Place an image (Ctrl+I)">
          Image
        </button>
        <button onClick={props.onOpenScene} title="Open a scene (Ctrl+O)">
          Open
        </button>
        <button onClick={props.onSave} title="Save scene (Ctrl+S)">
          Save
        </button>
        <span className="titlebar-sep" />
        <select
          className="titlebar-scale"
          value={props.scale}
          onChange={(e) => props.onScaleChange(Number(e.target.value) as ExportScale)}
          title="Export resolution"
          aria-label="Export resolution"
        >
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={3}>3x</option>
        </select>
        <button onClick={props.onExport} title="Export PNG (Ctrl+E)">
          Export
        </button>
        <button className="primary" onClick={props.onCopy} title="Copy to clipboard (Ctrl+Shift+C)">
          Copy
        </button>
      </div>

      <div className="titlebar-window">
        <button
          className={pinned ? 'pinned' : ''}
          onClick={togglePin}
          title={pinned ? 'Unpin from top' : 'Keep above other windows'}
          aria-pressed={pinned}
        >
          {/* A pushpin. Filled when the window is pinned. */}
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M6 1h4l-.5 4 2.5 2.5V9H8.5v5L8 15.5 7.5 14V9H3.5V7.5L6 5z"
              fill={pinned ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button onClick={() => win.minimize()} title="Minimise" aria-label="Minimise">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          title={maximized ? 'Restore' : 'Maximise'}
          aria-label={maximized ? 'Restore' : 'Maximise'}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="3.5"
              y="3.5"
              width="9"
              height="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        </button>
        <button className="close" onClick={() => win.close()} title="Close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

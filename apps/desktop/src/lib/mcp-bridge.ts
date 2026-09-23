import { convertToExcalidrawElements, exportToBlob, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ArrangeOpSchema, SceneQuerySchema } from '@paintai/protocol'
import { arrange, hydrate, toSceneElements, validateSpecs } from '@paintai/scene-ops'
import { writeFile } from './files'

/**
 * The renderer half of the MCP server.
 *
 * Rust owns the socket, this owns the scene. A tool call arrives as a Tauri
 * event, executes here against `scene-ops` and the live Excalidraw API, and the
 * answer goes back through the `mcp_respond` command.
 *
 * Everything an agent can do goes through the same pure functions the UI uses.
 * That is the point of the dependency rule: there is no second, weaker path
 * into the scene that only agents take.
 */

interface ToolCall {
  id: string
  tool: string
  args: Record<string, unknown>
}

/** An MCP tool result. `error` is read by Rust and turned into `isError`. */
type ToolResult = { content: unknown[] } | { error: string }

function text(body: string): ToolResult {
  return { content: [{ type: 'text', text: body }] }
}

function data(value: unknown): ToolResult {
  return text(JSON.stringify(value))
}

/**
 * The canvas's current drawing style, for elements an agent creates.
 *
 * `appState.currentItem*` is what the UI applies to shapes a person draws, but
 * `convertToExcalidrawElements` ignores it entirely and uses its own hardcoded
 * defaults. Without this an agent draws in Sketch while the user is in Precise,
 * on the same canvas, which looks like a rendering bug rather than a setting.
 */
function canvasDefaults(api: ExcalidrawImperativeAPI): Record<string, unknown> {
  const state = api.getAppState()
  return {
    roughness: state.currentItemRoughness,
    fillStyle: state.currentItemFillStyle,
    fontFamily: state.currentItemFontFamily,
    strokeWidth: state.currentItemStrokeWidth,
    strokeStyle: state.currentItemStrokeStyle,
    strokeColor: state.currentItemStrokeColor,
    // appState stores this as a keyword; elements store a shape or null.
    roundness: state.currentItemRoundness === 'sharp' ? null : { type: 3 },
  }
}

/** Elements the agent named, or the current selection when it named none. */
function targets(api: ExcalidrawImperativeAPI, ids: unknown): ExcalidrawElement[] {
  const all = api.getSceneElements() as unknown as ExcalidrawElement[]

  if (Array.isArray(ids) && ids.length > 0) {
    const wanted = new Set(ids.map(String))
    return all.filter((el) => wanted.has(el.id))
  }

  const selected = api.getAppState().selectedElementIds
  return all.filter((el) => selected[el.id])
}

async function renderPNG(api: ExcalidrawImperativeAPI, scale: number, selectedOnly: boolean) {
  const all = api.getSceneElements()
  const selected = api.getAppState().selectedElementIds
  const elements = selectedOnly ? all.filter((el) => selected[el.id]) : all

  if (elements.length === 0) throw new Error('nothing to render, the canvas is empty')

  const appState = api.getAppState()

  return exportToBlob({
    elements,
    files: api.getFiles(),
    mimeType: 'image/png',
    appState: {
      exportBackground: appState.exportBackground,
      viewBackgroundColor: appState.viewBackgroundColor,
    },
    exportPadding: 16,
    getDimensions: (w: number, h: number) => ({ width: w * scale, height: h * scale, scale }),
  })
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function dispatch(
  api: ExcalidrawImperativeAPI,
  tool: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const state = api.getAppState()

  switch (tool) {
    case 'get_scene': {
      const query = SceneQuerySchema.partial().safeParse(args)
      const elements = toSceneElements(
        api.getSceneElements() as never,
        state.selectedElementIds,
        query.success ? query.data : undefined,
      )
      return data(elements)
    }

    case 'get_selection': {
      const elements = toSceneElements(api.getSceneElements() as never, state.selectedElementIds, {
        selectedOnly: true,
      })
      return data(elements)
    }

    case 'render_scene': {
      const scale = Math.min(Math.max(Number(args.scale) || 1, 1), 3)
      const blob = await renderPNG(api, scale, args.selectedOnly === true)
      return {
        content: [{ type: 'image', data: await toBase64(blob), mimeType: 'image/png' }],
      }
    }

    case 'add_elements': {
      const existing = api.getSceneElements()

      // Validation runs before anything touches the canvas, and its messages are
      // written for a model to read and correct.
      const result = validateSpecs(
        args.specs,
        existing.map((el) => el.id),
      )
      if (!result.ok) return { error: `invalid specs: ${result.errors.join('; ')}` }

      // Geometry of what is already there, so an arrow can be routed to a shape
      // the agent did not create in this batch.
      const known: Record<string, { x: number; y: number; w: number; h: number }> = {}
      for (const el of existing) {
        known[el.id] = { x: el.x, y: el.y, w: el.width, h: el.height }
      }

      const created = convertToExcalidrawElements(
        hydrate(result.specs, { defaults: canvasDefaults(api), known }) as never,
      )

      api.updateScene({
        elements: [...existing, ...created],
        captureUpdate: 'IMMEDIATELY' as never,
      })

      return data({ added: created.length, ids: created.map((el) => el.id) })
    }

    case 'update_elements': {
      const patches = Array.isArray(args.patches) ? args.patches : []
      if (patches.length === 0) return { error: 'no patches supplied' }

      const byId = new Map<string, Record<string, unknown>>()
      for (const patch of patches as Record<string, unknown>[]) {
        if (typeof patch.id === 'string') byId.set(patch.id, patch)
      }

      let changed = 0
      const next = (api.getSceneElements() as unknown as ExcalidrawElement[]).map((el) => {
        const patch = byId.get(el.id)
        if (!patch) return el
        changed += 1
        const { id: _ignored, ...fields } = patch
        void _ignored
        return newElementWith(el, fields as never)
      })

      if (changed === 0) return { error: 'no element matched the supplied ids' }

      api.updateScene({ elements: next as never, captureUpdate: 'IMMEDIATELY' as never })
      return data({ updated: changed })
    }

    case 'delete_elements': {
      const ids = new Set((Array.isArray(args.ids) ? args.ids : []).map(String))
      if (ids.size === 0) return { error: 'no ids supplied' }

      const all = api.getSceneElements() as unknown as ExcalidrawElement[]

      // Cascade to bound children.
      //
      // get_scene folds a bound label into its container, so an agent never
      // sees the label's own id and can only ask to delete the shape. Without
      // this the caption survives as an orphan floating on the canvas.
      for (const el of all) {
        if (!ids.has(el.id)) continue
        for (const bound of el.boundElements ?? []) {
          if (bound.type === 'text') ids.add(bound.id)
        }
      }

      const next = all.filter((el) => !ids.has(el.id))

      api.updateScene({ elements: next as never, captureUpdate: 'IMMEDIATELY' as never })
      return data({ deleted: all.length - next.length })
    }

    case 'arrange': {
      const op = ArrangeOpSchema.safeParse(args)
      if (!op.success) {
        return { error: `invalid arrange op: ${op.error.issues.map((i) => i.message).join('; ')}` }
      }

      const chosen = targets(api, args.ids)
      if (chosen.length === 0) return { error: 'nothing selected and no ids supplied' }

      const compact = toSceneElements(chosen as never, state.selectedElementIds, { limit: 1000 })
      const moves = arrange(compact, op.data)
      if (moves.length === 0) return data({ moved: 0, note: 'already arranged' })

      const byId = new Map(moves.map((m) => [m.id, m]))
      const next = (api.getSceneElements() as unknown as ExcalidrawElement[]).map((el) => {
        const move = byId.get(el.id)
        return move ? newElementWith(el, { x: move.x, y: move.y }) : el
      })

      api.updateScene({ elements: next as never, captureUpdate: 'IMMEDIATELY' as never })
      return data({ moved: moves.length })
    }

    case 'export_png': {
      const path = typeof args.path === 'string' ? args.path : ''
      if (!path) return { error: 'path is required' }

      const scale = Math.min(Math.max(Number(args.scale) || 2, 1), 3)
      const blob = await renderPNG(api, scale, false)
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()))

      return data({ written: path, scale })
    }

    default:
      return { error: `unknown tool '${tool}'` }
  }
}

/**
 * Start listening for tool calls.
 *
 * Returns an unsubscribe function. Every failure is reported back rather than
 * thrown, because a rejected promise here would leave the Rust side waiting out
 * its full timeout for no reason.
 */
export async function startMcpBridge(getApi: () => ExcalidrawImperativeAPI | null) {
  return listen<ToolCall>('mcp:call', async (event) => {
    const { id, tool, args } = event.payload

    const api = getApi()
    if (!api) {
      await invoke('mcp_respond', { id, result: { error: 'canvas is not ready yet' } })
      return
    }

    try {
      const result = await dispatch(api, tool, args ?? {})
      await invoke('mcp_respond', { id, result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await invoke('mcp_respond', { id, result: { error: message } })
    }
  })
}

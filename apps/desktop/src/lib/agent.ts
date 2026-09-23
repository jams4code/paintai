import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/**
 * Client for the agent subprocess.
 *
 * Claude Code emits newline-delimited JSON on stdout. This turns that firehose
 * into the three things a panel actually needs to show: assistant text, which
 * tool is running, and when it is finished.
 */

export type AgentEvent =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; code?: number }

interface Chunk {
  stream: 'stdout' | 'stderr'
  line: string
}

/** Strip the `mcp__paintai__` prefix so the panel shows `get_scene`. */
function friendlyToolName(name: string): string {
  return name.replace(/^mcp__[^_]+__/, '')
}

/**
 * Interpret one stream-json object.
 *
 * Only the shapes that carry something worth displaying are handled. The rest
 * of the protocol is init banners and bookkeeping, and rendering it would turn
 * the panel into a log viewer.
 */
function interpret(parsed: unknown): AgentEvent[] {
  if (typeof parsed !== 'object' || parsed === null) return []
  const record = parsed as Record<string, unknown>
  const out: AgentEvent[] = []

  if (record.type === 'assistant') {
    const message = record.message as { content?: unknown[] } | undefined
    for (const block of message?.content ?? []) {
      const item = block as Record<string, unknown>
      if (item.type === 'text' && typeof item.text === 'string') {
        out.push({ kind: 'text', text: item.text })
      } else if (item.type === 'tool_use' && typeof item.name === 'string') {
        out.push({ kind: 'tool', name: friendlyToolName(item.name) })
      }
    }
  }

  if (record.type === 'result' && record.is_error === true) {
    const message = typeof record.result === 'string' ? record.result : 'the agent failed'
    out.push({ kind: 'error', message })
  }

  return out
}

/**
 * Subscribe to agent output.
 *
 * Stdout arrives in arbitrary fragments, not neat lines, so partial JSON is
 * buffered until a newline completes it. Parsing each fragment as it lands
 * would throw on roughly every other chunk.
 */
export async function subscribeToAgent(onEvent: (event: AgentEvent) => void) {
  let buffer = ''

  const chunks = await listen<Chunk>('agent:chunk', (event) => {
    const { stream, line } = event.payload

    if (stream === 'stderr') {
      // The CLI writes progress to stderr too, so only surface real failures.
      if (/error|not found|cannot|failed/i.test(line)) {
        onEvent({ kind: 'error', message: line.trim() })
      }
      return
    }

    buffer += line
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const candidate of lines) {
      const trimmed = candidate.trim()
      if (!trimmed) continue
      try {
        for (const item of interpret(JSON.parse(trimmed))) onEvent(item)
      } catch {
        // A line that is not JSON is the CLI talking to a human. Ignore it
        // rather than showing the user a parse error they cannot act on.
      }
    }
  })

  const done = await listen<{ code?: number; error?: string }>('agent:done', (event) => {
    buffer = ''
    if (event.payload.error) onEvent({ kind: 'error', message: event.payload.error })
    onEvent({ kind: 'done', code: event.payload.code })
  })

  return () => {
    chunks()
    done()
  }
}

export function sendToAgent(prompt: string, cwd?: string): Promise<void> {
  return invoke('agent_send', { prompt, cwd: cwd ?? null })
}

export function stopAgent(): Promise<void> {
  return invoke('agent_stop')
}

export function agentAvailable(): Promise<boolean> {
  return invoke<boolean>('agent_available')
}

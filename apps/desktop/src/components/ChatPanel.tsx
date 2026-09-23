import { useCallback, useEffect, useRef, useState } from 'react'
import {
  agentAvailable,
  sendToAgent,
  stopAgent,
  subscribeToAgent,
  type AgentEvent,
} from '../lib/agent'

/**
 * The panel where the user talks to their coding agent.
 *
 * It runs the user's own Claude Code CLI, pointed at this app's MCP server, so
 * the agent is looking at the same canvas. That is the whole reason the panel
 * exists: instructing an agent that cannot see your work is just typing into a
 * terminal with extra steps.
 */

interface Message {
  role: 'you' | 'agent'
  text: string
  /** Tools the agent used while producing this reply. */
  tools?: string[]
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ChatPanel({ open, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    agentAvailable()
      .then(setAvailable)
      .catch(() => setAvailable(false))
  }, [open])

  /** Append to the reply in progress, creating it on the first chunk. */
  const appendToReply = useCallback((update: (message: Message) => Message) => {
    setMessages((current) => {
      const last = current[current.length - 1]
      if (last?.role === 'agent') {
        return [...current.slice(0, -1), update(last)]
      }
      return [...current, update({ role: 'agent', text: '' })]
    })
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    subscribeToAgent((event: AgentEvent) => {
      switch (event.kind) {
        case 'text':
          appendToReply((m) => ({ ...m, text: m.text + event.text }))
          break
        case 'tool':
          appendToReply((m) => ({
            ...m,
            // Same tool twice in a row is noise; the user cares that it looked
            // at the canvas, not that it looked twice.
            tools:
              m.tools && m.tools[m.tools.length - 1] === event.name
                ? m.tools
                : [...(m.tools ?? []), event.name],
          }))
          break
        case 'error':
          appendToReply((m) => ({ ...m, text: `${m.text}\n\n⚠ ${event.message}`.trim() }))
          break
        case 'done':
          setBusy(false)
          break
      }
    })
      .then((fn) => {
        unsubscribe = fn
      })
      .catch(() => {})

    return () => unsubscribe?.()
  }, [appendToReply])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function send() {
    const prompt = draft.trim()
    if (!prompt || busy) return

    setMessages((current) => [...current, { role: 'you', text: prompt }])
    setDraft('')
    setBusy(true)

    try {
      await sendToAgent(prompt)
    } catch (err) {
      setBusy(false)
      setMessages((current) => [
        ...current,
        { role: 'agent', text: `⚠ ${err instanceof Error ? err.message : String(err)}` },
      ])
    }
  }

  if (!open) return null

  return (
    <aside className="chat" aria-label="Agent">
      <header className="chat-head">
        <span>Agent</span>
        <button onClick={onClose} title="Close panel" aria-label="Close panel">
          ✕
        </button>
      </header>

      {available === false && (
        <div className="chat-warning">
          Claude Code was not found on your PATH. Install it, or use the MCP server directly from
          your own terminal.
        </div>
      )}

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>The agent can see this canvas.</p>
            <ul>
              <li>&ldquo;what is on the canvas?&rdquo;</li>
              <li>&ldquo;add a login form mockup&rdquo;</li>
              <li>&ldquo;tidy up what I drew&rdquo;</li>
              <li>&ldquo;build this as a React component&rdquo;</li>
            </ul>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`chat-msg ${message.role}`}>
            {message.tools && message.tools.length > 0 && (
              <div className="chat-tools">{message.tools.join(' · ')}</div>
            )}
            <div className="chat-text">{message.text}</div>
          </div>
        ))}

        {busy && <div className="chat-busy">working…</div>}
      </div>

      <div className="chat-input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter is a newline. The opposite is correct for
            // a document and wrong for a chat.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Ask the agent about this canvas…"
          rows={3}
        />
        {busy ? (
          <button className="stop" onClick={() => void stopAgent()}>
            Stop
          </button>
        ) : (
          <button className="send" onClick={() => void send()} disabled={!draft.trim()}>
            Send
          </button>
        )}
      </div>
    </aside>
  )
}

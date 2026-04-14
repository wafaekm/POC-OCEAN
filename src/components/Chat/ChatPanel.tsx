import { useState, useRef, useEffect, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import ChatChartView from './ChatChartView'
import ChatMapView from './ChatMapView'

marked.use({
  breaks: true,
  renderer: { image: () => '' },
})

const BACKEND = 'http://localhost:8000'

const TOOL_LABELS: Record<string, string> = {
  get_maree_actuelle:     'marée actuelle',
  get_maree_pour_date:    'données marée',
  get_maree_journee:      'graphique marée journalier',
  get_current_datetime:   'date et heure',
  get_flood_scenarios:    'scénarios de submersion',
  get_flood_zones:        'zones PPRI',
  get_critical_networks:  'infrastructures critiques',
  get_xynthia_simulation: 'simulation Xynthia',
}

const DEFAULT_SUGGESTIONS = [
  'Quelle est la marée actuelle ?',
  'Scénarios de submersion',
  'Zones à risque PPRI',
  'Infrastructures critiques',
  'Simulation Xynthia',
]

interface Message {
  id: number
  role: 'user' | 'agent'
  type: 'text' | 'map' | 'chart'
  content: string
  visual?: unknown
  loading?: boolean
  statusText?: string
}

let nextId = 1

export default function ChatPanel() {
  const [messages, setMessages]       = useState<Message[]>([{
    id: 0, role: 'agent', type: 'text',
    content: 'Bonjour\u00a0! Je suis votre assistant expert en submersion marine pour La Rochelle. Comment puis-je vous aider\u00a0?',
  }])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const bottomRef                     = useRef<HTMLDivElement>(null)
  const inputRef                      = useRef<HTMLInputElement>(null)

  const isWelcome = messages.length === 1

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  useEffect(() => { scrollBottom() }, [messages])

  const setStatus = (id: number, text: string) => {
    setMessages(prev => prev.map(m => m.id === id && m.loading ? { ...m, statusText: text } : m))
  }

  async function send(text: string) {
    if (!text.trim() || loading) return
    setInput('')
    setLoading(true)
    setSuggestions([])

    const userMsg: Message = { id: nextId++, role: 'user', type: 'text', content: text }
    const loadId = nextId++
    const loadMsg: Message = { id: loadId, role: 'agent', type: 'text', content: '', loading: true, statusText: 'Connexion…' }
    setMessages(prev => [...prev, userMsg, loadMsg])
    scrollBottom()

    try {
      const res = await fetch(`${BACKEND}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: [] }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: { type: string; result?: { type: string; text: string; visual?: unknown; suggestions?: string[] }; message?: string }
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          if (event.type === 'done' && event.result) {
            const d = event.result
            setMessages(prev => prev.map(m => m.id === loadId ? {
              id: loadId, role: 'agent',
              type: (d.type as 'text' | 'map' | 'chart') ?? 'text',
              content: d.text,
              visual: d.visual ?? null,
            } : m))
            setSuggestions(d.suggestions ?? [])
          } else if (event.type === 'thinking') {
            setStatus(loadId, 'Interrogation de Mistral…')
          } else if (event.type === 'tool_call' && event.message) {
            setStatus(loadId, `Outil\u00a0: ${TOOL_LABELS[event.message] ?? event.message}…`)
          } else if (event.type === 'tool_result' && event.message) {
            setStatus(loadId, `${TOOL_LABELS[event.message] ?? event.message} ✓`)
          } else if (event.type === 'retry' && event.message) {
            setStatus(loadId, event.message)
          } else if (event.type === 'error') {
            setMessages(prev => prev.map(m => m.id === loadId
              ? { ...m, loading: false, content: 'Une erreur est survenue. Veuillez réessayer.' }
              : m))
          }
        }
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === loadId
        ? { ...m, loading: false, content: 'Impossible de joindre le serveur (port 8000).' }
        : m))
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'radial-gradient(ellipse at 50% 0%,#071e3d 0%,#040d1f 70%)', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'rgba(7,22,48,0.9)', borderBottom: '1px solid rgba(34,211,238,0.18)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <line x1="14" y1="2" x2="14" y2="5.5" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="14" cy="1.8" r="1.2" fill="#22d3ee"/>
            <rect x="7" y="6" width="14" height="10" rx="3" stroke="#22d3ee" strokeWidth="1.8" fill="rgba(34,211,238,0.08)"/>
            <circle cx="11" cy="11" r="1.7" fill="#22d3ee"/>
            <circle cx="17" cy="11" r="1.7" fill="#22d3ee"/>
            <path d="M3 21c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0 3.5 2 5.5 0" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#e2f0fb' }}>Géo-Twin Littoral</div>
          <div style={{ fontSize: '0.7rem', color: '#67b8cc' }}>Assistant submersion — La Rochelle</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 8px #22d3ee', animation: 'pulse 2.4s ease-in-out infinite' }} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 8px' }}>

        {isWelcome ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, textAlign: 'center', padding: '20px 8px' }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e2f0fb' }}>Comment puis-je vous aider ?</div>
            <div style={{ fontSize: '0.78rem', color: '#67b8cc' }}>Posez une question sur la marée, les risques côtiers ou le niveau marin</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
              {DEFAULT_SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} style={chipStyle('welcome')}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestions contextuelles */}
      {!isWelcome && suggestions.length > 0 && !loading && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 8px' }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => send(s)} style={chipStyle('inline')}>{s}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '10px 14px 12px', background: 'rgba(7,22,48,0.9)', borderTop: '1px solid rgba(34,211,238,0.12)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Posez votre question…"
            disabled={loading}
            style={{ flex: 1, background: 'rgba(13,34,64,0.8)', border: '1px solid rgba(34,211,238,0.25)', borderRadius: 10, color: '#e2f0fb', padding: '10px 14px', fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit', opacity: loading ? 0.5 : 1 }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#0891b2,#22d3ee)', border: 'none', color: '#040d1f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: !input.trim() || loading ? 0.35 : 1 }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

    </div>
  )
}

function Bubble({ msg }: { msg: Message }) {
  const isAgent = msg.role === 'agent'

  if (msg.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <Avatar />
        <div style={{ ...bubbleBase, background: 'rgba(13,34,64,0.9)', border: '1px solid rgba(34,211,238,0.18)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {[0, 0.18, 0.36].map((d, i) => (
            <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#22d3ee', opacity: 0.7, display: 'inline-block', animation: `bounce 1.4s ${d}s ease-in-out infinite` }} />
          ))}
          {msg.statusText && <span style={{ fontSize: '0.78rem', color: '#67b8cc', marginLeft: 4 }}>{msg.statusText}</span>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: isAgent ? 'row' : 'row-reverse' }}>
      {isAgent ? <Avatar /> : <UserAvatar />}
      <div style={{ maxWidth: msg.type !== 'text' ? '96%' : '78%', width: msg.type !== 'text' ? '96%' : undefined }}>
        <div style={{ ...bubbleBase, background: isAgent ? 'rgba(13,34,64,0.9)' : 'rgba(8,60,100,0.85)', border: `1px solid rgba(34,211,238,${isAgent ? '0.18' : '0.15'})`, borderBottomLeftRadius: isAgent ? 4 : 16, borderBottomRightRadius: isAgent ? 16 : 4 }}>
          {isAgent
            ? <div className="chat-md" style={{ fontSize: '0.88rem', color: '#d8eef9', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.content ?? '') as string) }} />
            : <p style={{ fontSize: '0.88rem', color: '#d8eef9', margin: 0 }}>{msg.content}</p>
          }
        </div>
        {msg.type === 'chart' && msg.visual != null && <ChatChartView visual={msg.visual as never} />}
        {msg.type === 'map'   && msg.visual != null && <ChatMapView   visual={msg.visual as never} />}
      </div>
    </div>
  )
}

function Avatar() {
  return (
    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 }}>
      <svg width="17" height="17" viewBox="0 0 28 28" fill="none">
        <rect x="7" y="6" width="14" height="10" rx="3" stroke="#22d3ee" strokeWidth="1.8" fill="none"/>
        <circle cx="11" cy="11" r="1.5" fill="#22d3ee"/>
        <circle cx="17" cy="11" r="1.5" fill="#22d3ee"/>
        <path d="M3 21c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0 3.5 2 5.5 0" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
      </svg>
    </div>
  )
}

function UserAvatar() {
  return (
    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(100,150,180,0.12)', border: '1px solid rgba(100,150,180,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="#94b4cc" strokeWidth="2"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#94b4cc" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

const bubbleBase: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 14, lineHeight: 1.6, wordBreak: 'break-word',
}

function chipStyle(variant: 'welcome' | 'inline'): React.CSSProperties {
  return {
    border: '1px solid rgba(34,211,238,0.25)',
    borderRadius: 20,
    cursor: 'pointer',
    fontFamily: 'inherit',
    background: 'rgba(34,211,238,0.08)',
    color: '#a8dcea',
    padding: variant === 'welcome' ? '8px 14px' : '5px 11px',
    fontSize: variant === 'welcome' ? '0.82rem' : '0.75rem',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
  }
}

/**
 * AssistantChat — chat component riutilizzabile per l'assistente AI.
 *
 * Props:
 *   machineId?, reportId?  — context passato all'Edge Function per filtrare il retrieval
 *   onSourceClick(reportId) — callback quando il tecnico clicca una source chip
 *   initialQuery?          — domanda precompilata (es. quando aperto da ReportDetail)
 *   autoSendInitial?       — se true, invia subito la initialQuery al mount
 *   compact?               — layout compatto (per embed in ReportDetail)
 *   suggestions?           — array di prompt suggeriti mostrati nello stato vuoto
 */

import { useEffect, useRef } from 'react'
import { Send, Sparkles, FileText, Loader2, AlertCircle } from 'lucide-react'
import useAssistantChat from '../../hooks/useAssistantChat'
import { renderMarkdown } from '../../lib/markdown'
import { useHaptic } from '../../hooks/useHaptic'

const DEFAULT_SUGGESTIONS = [
  'Il nastro trasportatore si blocca a metà corsa',
  'Motore elettrico che surriscalda sotto carico',
  'Perdita olio nel riduttore: cause più comuni?',
]

export default function AssistantChat({
  machineId,
  reportId,
  initialConversationId,
  onSourceClick,
  initialQuery = '',
  autoSendInitial = false,
  compact = false,
  fillParent = false,
  suggestions = DEFAULT_SUGGESTIONS,
  scope,
  power,
}) {
  const { messages, sending, loading, error, send } = useAssistantChat({ machineId, reportId, initialConversationId, scope, power })
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const haptic = useHaptic()
  const didAutoSendRef = useRef(false)

  // Auto-scroll sul fondo a ogni nuovo messaggio
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, sending])

  // Autoinvio initialQuery
  useEffect(() => {
    if (autoSendInitial && initialQuery && !didAutoSendRef.current) {
      didAutoSendRef.current = true
      send(initialQuery)
    }
  }, [autoSendInitial, initialQuery, send])

  // Precompila input con initialQuery
  useEffect(() => {
    if (initialQuery && !autoSendInitial && inputRef.current && !inputRef.current.value) {
      inputRef.current.value = initialQuery
    }
  }, [initialQuery, autoSendInitial])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const value = inputRef.current?.value || ''
    if (!value.trim() || sending) return
    haptic?.light?.()
    inputRef.current.value = ''
    await send(value)
  }

  const handleSuggestion = (s) => {
    if (inputRef.current) inputRef.current.value = s
    send(s)
  }

  const showWelcome = messages.length === 0 && !sending && !loading

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // fillParent = layout desktop/modal (altezza 100% del parent)
        // compact = layout embedded con min-height
        // default = layout mobile full-page con calc(100dvh - header - bottom nav)
        height: fillParent ? '100%' : (compact ? 'auto' : 'calc(100dvh - 220px)'),
        minHeight: compact ? 320 : 0,
        background: 'var(--color-surface-1)',
        borderRadius: compact || fillParent ? 16 : 0,
        border: compact ? '1px solid var(--color-border-subtle)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="stagger-children"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: compact ? 14 : 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {showWelcome && <WelcomeState suggestions={suggestions} onPick={handleSuggestion} />}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onSourceClick={onSourceClick}
          />
        ))}

        {sending && !messages.some(m => m.pending) && <TypingIndicator />}

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              fontSize: 13,
              color: 'var(--color-danger)',
              background: 'var(--color-danger-glow)',
              borderRadius: 10,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: 10,
          padding: compact ? 12 : 14,
          borderTop: '1px solid var(--color-border-subtle)',
          background: 'var(--color-surface-0)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Descrivi il guasto o fai una domanda…"
          disabled={sending}
          maxLength={2000}
          style={{
            flex: 1,
            padding: '12px 14px',
            fontSize: 14,
            borderRadius: 12,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text)',
            outline: 'none',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)' }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--color-border-subtle)' }}
        />
        <button
          type="submit"
          disabled={sending}
          className="press-scale"
          aria-label="Invia"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: 'none',
            cursor: sending ? 'not-allowed' : 'pointer',
            background: 'var(--gradient-primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow-primary)',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Sotto-componenti
// ══════════════════════════════════════════════════════════

function WelcomeState({ suggestions, onPick }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 8px' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: 'var(--gradient-primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
          boxShadow: 'var(--shadow-glow-primary)',
        }}
      >
        <Sparkles size={26} color="#fff" strokeWidth={2.2} />
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--color-text)',
          marginBottom: 4,
        }}
      >
        Assistente Tecnico AI
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        Descrivi il guasto: cercherò soluzioni negli interventi della tua squadra, risolti e ancora aperti.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="press-scale"
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 12,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-active)'
              e.currentTarget.style.color = 'var(--color-text)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ message, onSourceClick }) {
  const isUser = message.role === 'user'
  const isPending = message.pending

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '85%',
            padding: '10px 14px',
            fontSize: 14,
            lineHeight: 1.45,
            borderRadius: '18px 18px 4px 18px',
            background: 'var(--gradient-primary)',
            color: '#fff',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: 'var(--gradient-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: 'var(--shadow-glow-primary)',
        }}
      >
        <Sparkles size={15} color="#fff" strokeWidth={2.2} />
      </div>
      <div style={{ maxWidth: '85%' }}>
        <div
          style={{
            padding: '10px 14px',
            fontSize: 14,
            lineHeight: 1.5,
            borderRadius: '4px 18px 18px 18px',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          {isPending
            ? <TypingDots />
            : renderMarkdown(message.content)}
        </div>
        {!isPending && Array.isArray(message.sources) && message.sources.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 8,
            }}
          >
            {message.sources.map((src) => (
              <button
                key={src.report_id}
                type="button"
                onClick={() => onSourceClick?.(src.report_id)}
                className="press-scale"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  borderRadius: 999,
                  background: 'var(--color-primary-glow)',
                  color: 'var(--color-primary)',
                  border: '1px solid var(--color-border-active)',
                  cursor: 'pointer',
                }}
                title={src.title || 'Apri report'}
              >
                <FileText size={11} />
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {src.title || 'Report'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 32, height: 32, borderRadius: 10,
          background: 'var(--gradient-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-glow-primary)',
        }}
      >
        <Sparkles size={15} color="#fff" />
      </div>
      <div
        style={{
          padding: '10px 14px',
          borderRadius: '4px 18px 18px 18px',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        <TypingDots />
      </div>
    </div>
  )
}

function TypingDots() {
  const dotStyle = (delay) => ({
    width: 7, height: 7, borderRadius: '50%',
    background: 'var(--color-text-muted)',
    animation: `pulse 1.2s ease-in-out ${delay}s infinite`,
  })
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={dotStyle(0)} />
      <span style={dotStyle(0.2)} />
      <span style={dotStyle(0.4)} />
    </div>
  )
}


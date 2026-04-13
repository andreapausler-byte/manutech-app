/**
 * AssistantPage — pagina full-screen per l'assistente AI del tecnico.
 *
 * Mostra la chat AssistantChat a tutta altezza + dropdown per tornare
 * a conversazioni passate o iniziarne una nuova.
 * In demo mode mostra solo il DemoBanner.
 */

import { useCallback, useState } from 'react'
import { Plus, ChevronLeft, History } from 'lucide-react'
import AssistantChat from '../../components/assistant/AssistantChat'
import DemoBanner from '../../components/assistant/DemoBanner'
import { isAssistantAvailable, listConversations } from '../../lib/assistant'

export default function AssistantPage({ onOpenReport }) {
  const available = isAssistantAvailable()
  const [convs, setConvs] = useState([])
  const [convsLoaded, setConvsLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  // chatKey forza il remount di AssistantChat quando si cambia conversazione
  const [chatKey, setChatKey] = useState(0)

  const loadConvsIfNeeded = useCallback(async () => {
    if (!available || convsLoaded) return
    try {
      const list = await listConversations({ limit: 30 })
      setConvs(list)
      setConvsLoaded(true)
    } catch (err) {
      console.warn('[Assistant] listConversations failed:', err.message)
    }
  }, [available, convsLoaded])

  const toggleHistory = () => {
    const next = !showHistory
    setShowHistory(next)
    if (next) loadConvsIfNeeded()
  }

  const handleNewConv = () => {
    setSelectedId(null)
    setShowHistory(false)
    setChatKey(k => k + 1)
    setConvsLoaded(false) // forza refresh al prossimo toggle history
  }

  const handleSelect = (id) => {
    setSelectedId(id)
    setShowHistory(false)
    setChatKey(k => k + 1)
  }

  if (!available) {
    return (
      <div style={{ padding: 16 }}>
        <Header title="Assistente AI" subtitle="Basato sul tuo storico di interventi" />
        <div style={{ marginTop: 16 }}>
          <DemoBanner />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '14px 16px 8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Header title="Assistente AI" subtitle="Basato sul tuo storico di interventi" />
          </div>
          <button
            type="button"
            onClick={toggleHistory}
            className="press-scale"
            aria-label="Storico conversazioni"
            title="Storico"
            style={iconBtnStyle}
          >
            <History size={17} />
          </button>
          <button
            type="button"
            onClick={handleNewConv}
            className="press-scale"
            aria-label="Nuova conversazione"
            title="Nuova"
            style={{ ...iconBtnStyle, background: 'var(--gradient-primary)', color: '#fff' }}
          >
            <Plus size={17} />
          </button>
        </div>

        {showHistory && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 14,
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border-subtle)',
              overflow: 'hidden',
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {convs.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
                Nessuna conversazione salvata.
              </div>
            ) : (
              convs.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    background: selectedId === c.id ? 'var(--color-primary-glow)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'var(--color-text)',
                  }}
                >
                  <ChevronLeft size={14} color="var(--color-text-muted)" style={{ transform: 'rotate(180deg)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {new Date(c.updated_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '0 8px 8px 8px' }}>
        <AssistantChat
          key={chatKey}
          initialConversationId={selectedId}
          onSourceClick={onOpenReport}
        />
      </div>
    </div>
  )
}

function Header({ title, subtitle }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
        {subtitle}
      </div>
    </div>
  )
}

const iconBtnStyle = {
  width: 38,
  height: 38,
  borderRadius: 12,
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
}

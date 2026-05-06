/**
 * AdminAssistantPage — versione desktop dell'assistente AI per admin.
 *
 * Differenze rispetto a mobile/AssistantPage:
 * - Layout a tutta pagina con header Dashboard-style (PageHeader)
 * - Chat con fillParent=true (altezza 100% del wrapper)
 * - Storico conversazioni visibile a destra come colonna (quando si vuole)
 */

import { useCallback, useState } from 'react'
import { Plus, History } from 'lucide-react'
import AssistantChat from '../../components/assistant/AssistantChat'
import DemoBanner from '../../components/assistant/DemoBanner'
import PageHeader from '../../components/layout/PageHeader'
import { findNavItem } from '../../lib/adminNav'
import { isAssistantAvailable, listConversations } from '../../lib/assistant'

const NAV_ITEM = findNavItem('assistant')

export default function AdminAssistantPage({ onOpenReport, initialMachineId }) {
  const available = isAssistantAvailable()
  const [convs, setConvs] = useState([])
  const [convsLoaded, setConvsLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [chatKey, setChatKey] = useState(0)

  const loadConvsIfNeeded = useCallback(async () => {
    if (!available || convsLoaded) return
    try {
      const list = await listConversations({ limit: 40 })
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
    setChatKey(k => k + 1)
    setConvsLoaded(false)
  }

  const handleSelect = (id) => {
    setSelectedId(id)
    setChatKey(k => k + 1)
  }

  if (!available) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader title={NAV_ITEM.label} description={NAV_ITEM.desc} />
        <DemoBanner />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100dvh - 180px)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <PageHeader title={NAV_ITEM.label} description={NAV_ITEM.desc} />
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={toggleHistory}
            aria-label="Storico conversazioni"
            title="Storico"
            style={iconBtnStyle(showHistory)}
          >
            <History size={17} />
          </button>
          <button
            type="button"
            onClick={handleNewConv}
            aria-label="Nuova conversazione"
            title="Nuova conversazione"
            style={{ ...iconBtnStyle(false), background: 'var(--gradient-primary)', color: '#fff', border: 'none' }}
          >
            <Plus size={17} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showHistory ? '280px 1fr' : '1fr', gap: 16, flex: 1, minHeight: 0 }}>
        {showHistory && (
          <aside
            style={{
              borderRadius: 16,
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border-subtle)',
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Conversazioni recenti
            </div>
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
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    padding: '12px 14px',
                    background: selectedId === c.id ? 'var(--color-primary-glow)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'var(--color-text)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {new Date(c.updated_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </button>
              ))
            )}
          </aside>
        )}

        <div style={{ minHeight: 0 }}>
          <AssistantChat
            key={chatKey}
            initialConversationId={selectedId}
            machineId={selectedId ? undefined : initialMachineId}
            onSourceClick={onOpenReport}
            fillParent
          />
        </div>
      </div>
    </div>
  )
}

const iconBtnStyle = (active) => ({
  width: 38,
  height: 38,
  borderRadius: 12,
  border: '1px solid var(--color-border-subtle)',
  background: active ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
  color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
})

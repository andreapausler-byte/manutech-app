// Modalità alternativa del pannello destro del calendario: lista interventi
// con status='pianificato' e assigned_to_role='fornitore', cioè in attesa di
// conferma dal fornitore. Bottone "Sollecita" che aggiorna planning_notes con
// timestamp del sollecito (magic link vero arriva in Sprint 2).

import { useEffect, useState } from 'react'
import { X, Bell, Inbox } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useInterventionMutations } from '../../hooks/useInterventionMutations'
import { formatScheduledShort } from '../../lib/interventions'
import InterventionBadge from './InterventionBadge'

export default function PendingSuppliersPanel({ onClose, onSelect }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const mutations = useInterventionMutations()

  const reload = async () => {
    setLoading(true)
    try {
      const data = await db.getInterventions({
        statuses: ['pianificato'],
        assigned_to_role: 'fornitore',
      })
      setItems(data || [])
    } catch (e) {
      console.warn('[PendingSuppliersPanel] load failed:', e?.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const handleRemind = async (id) => {
    try {
      await mutations.remindSupplier(id)
      reload()
    } catch { /* toast già mostrato */ }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-surface-1)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div>
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
            textTransform: 'uppercase', color: 'var(--color-text-secondary)',
            margin: 0,
          }}>In attesa fornitori</p>
          <p style={{
            fontSize: 18, fontWeight: 700, color: 'var(--color-text)',
            margin: '2px 0 0',
            fontFamily: '"JetBrains Mono", monospace',
          }}>{items.length}</p>
        </div>
        <button onClick={onClose} aria-label="Chiudi pannello" className="press-scale"
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: 'none',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
        {loading ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, padding: 12 }}>
            Caricamento…
          </p>
        ) : items.length === 0 ? (
          <div style={{
            padding: 24, textAlign: 'center',
            color: 'var(--color-text-secondary)',
          }}>
            <Inbox size={28} style={{ opacity: 0.5, marginBottom: 8 }} />
            <p style={{ fontSize: 13, margin: 0 }}>Nessun fornitore in attesa.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(intv => (
              <div key={intv.id} style={{
                padding: 10,
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
              }}>
                <button
                  onClick={() => onSelect?.(intv.id)}
                  className="press-scale"
                  style={{
                    width: '100%',
                    background: 'transparent', border: 'none',
                    textAlign: 'left', cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <p style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
                    margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{intv.title}</p>
                  <p style={{
                    fontSize: 11, color: 'var(--color-text-secondary)',
                    margin: '2px 0 0',
                  }}>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      {formatScheduledShort(intv.scheduled_start_at)}
                    </span>
                    {intv.assigned_to_name && <> · {intv.assigned_to_name}</>}
                  </p>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 8, gap: 8,
                }}>
                  <InterventionBadge field="status" value={intv.status} />
                  <button
                    onClick={() => handleRemind(intv.id)}
                    disabled={mutations.loading}
                    className="press-scale"
                    style={{
                      padding: '5px 9px',
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.35)',
                      borderRadius: 8,
                      color: '#f59e0b',
                      fontSize: 11, fontWeight: 700,
                      cursor: mutations.loading ? 'wait' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                    <Bell size={11} /> Sollecita
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

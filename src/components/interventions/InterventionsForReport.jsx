// Sezione embedded in ReportDetailModal: lista interventi del report + CTA
// "Pianifica intervento" che apre InterventionRequestModal pre-popolato.
//
// Hotfix #3 (osservato in produzione giorno 1): la label contava annullati,
// l'ordinamento metteva annullati misti con attivi, il peso visivo era
// identico. Refactor:
// - Conteggio header esclude annullati/completati
// - Sort: attivi prima (per scheduled_start_at ASC), storico sotto
// - Card storiche con prop `dim` (opacity 0.55 + line-through)
// - Separator "─ Storico ─" se ci sono entrambi i gruppi

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Plus } from 'lucide-react'
import { db } from '../../lib/supabase'
import InterventionCard from './InterventionCard'
import InterventionRequestModal from '../spare/InterventionRequestModal'

const HISTORIC_STATUSES = ['annullato', 'completato']
const isHistoric = (i) => i && HISTORIC_STATUSES.includes(i.status)

export default function InterventionsForReport({ report, user, onOpenIntervention }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const reload = useCallback(async () => {
    if (!report?.id) return
    setLoading(true)
    try {
      const data = await db.getInterventionsForReport(report.id)
      setItems(data || [])
    } catch (e) {
      console.warn('[InterventionsForReport] load failed:', e?.message)
    } finally {
      setLoading(false)
    }
  }, [report?.id])

  useEffect(() => { reload() }, [reload])

  // Split + sort: attivi (NOT IN annullato/completato) per scheduled_start_at ASC,
  // storico in ordine di completion/cancellation più recente prima (updated_at desc).
  const { active, historic } = useMemo(() => {
    const a = []
    const h = []
    for (const intv of (items || [])) {
      if (isHistoric(intv)) h.push(intv)
      else a.push(intv)
    }
    a.sort((x, y) => {
      const dx = x.scheduled_start_at ? new Date(x.scheduled_start_at).getTime() : Infinity
      const dy = y.scheduled_start_at ? new Date(y.scheduled_start_at).getTime() : Infinity
      return dx - dy
    })
    h.sort((x, y) => {
      const dx = new Date(x.updated_at || x.created_at).getTime()
      const dy = new Date(y.updated_at || y.created_at).getTime()
      return dy - dx
    })
    return { active: a, historic: h }
  }, [items])

  if (!report?.id) return null

  const hasItems = items.length > 0
  const hasActive = active.length > 0
  const hasHistoric = historic.length > 0

  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--color-surface-1, #0f1320)',
      border: '1px solid var(--color-border, #1f2433)',
      borderRadius: 12,
      marginBottom: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: hasItems ? 10 : 0,
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', color: 'var(--color-text-secondary)',
          fontFamily: '"JetBrains Mono", monospace',
          margin: 0,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Calendar size={11} /> Interventi attivi · {active.length}
          {hasHistoric && (
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: 0.6,
              color: 'var(--color-text-secondary)', opacity: 0.65,
              marginLeft: 4,
            }}>
              (+{historic.length} storic{historic.length === 1 ? 'o' : 'i'})
            </span>
          )}
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="press-scale"
          style={{
            padding: '6px 10px',
            background: 'var(--color-primary)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <Plus size={12} /> Pianifica intervento
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>…</p>
      ) : !hasItems ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {active.map(intv => (
            <InterventionCard
              key={intv.id}
              intervention={intv}
              compact
              onClick={() => onOpenIntervention?.(intv.id)}
            />
          ))}

          {/* Separator "─ Storico ─" solo se ci sono entrambi i gruppi.
              Se non ci sono attivi (solo storico), niente separator: la sezione
              è di per sé "storico", il dim della card lo comunica. */}
          {hasActive && hasHistoric && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              margin: '8px 0 2px',
              fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase', color: 'var(--color-text-secondary)',
              opacity: 0.6,
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              Storico
              <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>
          )}

          {historic.map(intv => (
            <InterventionCard
              key={intv.id}
              intervention={intv}
              compact
              dim
              onClick={() => onOpenIntervention?.(intv.id)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <InterventionRequestModal
          report={report}
          user={user}
          onClose={() => setShowModal(false)}
          onApplied={() => {
            setShowModal(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

// Sezione embedded in ReportDetailModal: lista interventi del report + CTA
// "Pianifica intervento" che apre InterventionRequestModal pre-popolato.

import { useCallback, useEffect, useState } from 'react'
import { Calendar, Plus } from 'lucide-react'
import { db } from '../../lib/supabase'
import InterventionCard from './InterventionCard'
import InterventionRequestModal from '../spare/InterventionRequestModal'

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

  if (!report?.id) return null

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
        marginBottom: items.length > 0 ? 10 : 0,
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', color: 'var(--color-text-secondary)',
          fontFamily: '"JetBrains Mono", monospace',
          margin: 0,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Calendar size={11} /> Interventi pianificati · {items.length}
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
      ) : items.length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(intv => (
            <InterventionCard
              key={intv.id}
              intervention={intv}
              compact
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

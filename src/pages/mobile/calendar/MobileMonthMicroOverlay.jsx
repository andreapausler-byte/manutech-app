import { useEffect, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS_MIN = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

/**
 * Mini-calendario 7×6 overlay, quick-jump per cambiare settimana al volo.
 *
 * Dot density per giorno indica N interventi. Tap su giorno = chiude overlay
 * + sposta la week-strip alla settimana di quel giorno + (opzionale) apre
 * MobileDayContextSheet su quella cella.
 *
 * Props
 *   open                    bool
 *   currentMonth            Date del mese da mostrare
 *   interventions           array del mese (per dot density)
 *   onClose()
 *   onDaySelect(date)       chiamato al tap su una cella valida
 *   onPrevMonth() / onNextMonth()
 */
export default function MobileMonthMicroOverlay({
  open,
  currentMonth,
  interventions = [],
  onClose,
  onDaySelect,
  onPrevMonth,
  onNextMonth,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const cells = useMemo(() => {
    if (!currentMonth) return []
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const firstOfMonth = new Date(y, m, 1)
    // Lunedì = 0, Domenica = 6 (italiano standard)
    const startOffset = (firstOfMonth.getDay() + 6) % 7
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const result = []
    for (let i = 0; i < startOffset; i++) result.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      result.push(new Date(y, m, d))
    }
    while (result.length < 42) result.push(null)
    return result
  }, [currentMonth])

  // Multi-day: l'intervento conta per ogni giorno del suo span.
  const countByDayKey = useMemo(() => {
    const map = new Map()
    for (const intv of interventions) {
      if (!intv.scheduled_start_at) continue
      const start = new Date(intv.scheduled_start_at)
      const endDate = intv.scheduled_end_at ? new Date(intv.scheduled_end_at) : start
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
      let guard = 0
      while (cursor <= endDay && guard++ < 366) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`
        map.set(key, (map.get(key) || 0) + 1)
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    return map
  }, [interventions])

  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Mini calendario ${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 55,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
      }}
    >
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.2s ease',
        }}
      />
      <div
        className="animate-slide-up"
        style={{
          position: 'relative',
          margin: 'calc(56px + env(safe-area-inset-top, 0px)) 12px 0',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <button
            onClick={onPrevMonth}
            aria-label="Mese precedente"
            className="press-scale"
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <ChevronLeft size={16} />
          </button>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: 'var(--color-text)',
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: -0.2,
          }}>
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </div>
          <button
            onClick={onNextMonth}
            aria-label="Mese successivo"
            className="press-scale"
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <ChevronRight size={16} />
          </button>
          <button
            onClick={onClose}
            aria-label="Chiudi mini calendario"
            className="press-scale"
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={16} />
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 0,
          padding: '6px 8px 2px',
        }}>
          {WEEKDAYS_MIN.map((w, i) => (
            <div key={i} style={{
              fontSize: 10, fontWeight: 700,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              padding: '4px 0',
            }}>{w}</div>
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
          padding: '0 8px 10px',
        }}>
          {cells.map((d, idx) => {
            if (!d) return <div key={`empty-${idx}`} style={{ aspectRatio: '1 / 1' }} />
            const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
            const count = countByDayKey.get(dayKey) || 0
            const isToday = d.getTime() === today.getTime()
            return (
              <button
                key={dayKey}
                onClick={() => onDaySelect?.(d)}
                aria-label={`${d.getDate()}${count > 0 ? `, ${count} interventi` : ''}`}
                className="press-scale"
                style={{
                  aspectRatio: '1 / 1',
                  minHeight: 36,
                  border: `1px solid ${isToday ? 'rgba(124,106,255,0.45)' : 'transparent'}`,
                  background: isToday ? 'rgba(124,106,255,0.10)' : 'transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  padding: 2,
                }}>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  fontFamily: '"JetBrains Mono", monospace',
                  color: isToday ? 'var(--color-primary)' : 'var(--color-text)',
                  lineHeight: 1,
                }}>
                  {d.getDate()}
                </span>
                {count > 0 && (
                  <div style={{
                    display: 'flex', gap: 2, alignItems: 'center',
                    height: 4,
                  }}>
                    {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <span key={i} style={{
                        width: 3, height: 3, borderRadius: 999,
                        background: 'var(--color-primary)',
                      }} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Vista mese del calendario admin. CSS Grid 7×N, settimana inizia lunedì.
// Ogni cella elenca gli interventi del giorno via <InterventionPill>.
// Tap su giorno → onDayClick(date). Tap su intervento → onInterventionClick(i).

import { useMemo } from 'react'
import InterventionPill from './InterventionPill'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

// Costruisce la matrice settimane × giorni per il mese richiesto.
// Lunedì come primo giorno della settimana (convenzione IT).
function buildMonthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  // Day of week con lunedì=0..domenica=6
  const startWeekday = (first.getDay() + 6) % 7
  const totalCells = Math.ceil((startWeekday + last.getDate()) / 7) * 7
  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - startWeekday
    const date = new Date(year, month, 1 + dayOffset)
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      key: date.toISOString().slice(0, 10),
    })
  }
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

export default function CalendarMonthGrid({
  year,
  month, // 0-11
  interventions = [],
  onDayClick,
  onInterventionClick,
  selectedInterventionId,
  maxPillsPerCell = 3,
}) {
  const weeks = useMemo(() => buildMonthMatrix(year, month), [year, month])
  const today = new Date()

  // Indicizza interventi per giorno (chiave YYYY-MM-DD).
  const byDay = useMemo(() => {
    const map = {}
    for (const i of interventions) {
      if (!i.scheduled_start_at) continue
      const d = new Date(i.scheduled_start_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map[key]) map[key] = []
      map[key].push(i)
    }
    // Ordina per orario crescente dentro ogni giorno
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => new Date(a.scheduled_start_at) - new Date(b.scheduled_start_at))
    }
    return map
  }, [interventions])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header weekdays */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 0,
        borderBottom: '1px solid var(--color-border)',
      }}>
        {WEEKDAY_LABELS.map(l => (
          <div key={l} style={{
            padding: '8px 10px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            fontFamily: '"JetBrains Mono", monospace',
            borderRight: '1px solid var(--color-border)',
          }}>
            {l}
          </div>
        ))}
      </div>

      {/* Weeks grid */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateRows: `repeat(${weeks.length}, 1fr)`,
        minHeight: 0,
      }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            borderBottom: wi < weeks.length - 1 ? '1px solid var(--color-border)' : 'none',
            minHeight: 0,
          }}>
            {week.map(cell => {
              const items = byDay[cell.key] || []
              const isToday = isSameDay(cell.date, today)
              const overflow = items.length - maxPillsPerCell
              return (
                <button
                  key={cell.key}
                  onClick={() => onDayClick?.(cell.date)}
                  style={{
                    minHeight: 0,
                    padding: 6,
                    background: isToday ? 'rgba(124,106,255,0.06)' : 'transparent',
                    border: 'none',
                    borderRight: '1px solid var(--color-border)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    opacity: cell.inMonth ? 1 : 0.4,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    fontWeight: isToday ? 800 : 600,
                    color: isToday ? 'var(--color-primary)' : 'var(--color-text)',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    <span>{cell.date.getDate()}</span>
                    {items.length > 0 && (
                      <span style={{
                        fontSize: 9,
                        background: 'var(--color-surface-2)',
                        padding: '1px 5px',
                        borderRadius: 999,
                        color: 'var(--color-text-secondary)',
                      }}>{items.length}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {items.slice(0, maxPillsPerCell).map(intv => (
                      <InterventionPill
                        key={intv.id}
                        intervention={intv}
                        active={intv.id === selectedInterventionId}
                        onClick={onInterventionClick}
                      />
                    ))}
                    {overflow > 0 && (
                      <p style={{
                        fontSize: 10,
                        color: 'var(--color-text-secondary)',
                        margin: '2px 0 0',
                        fontWeight: 600,
                      }}>
                        +{overflow} altri
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

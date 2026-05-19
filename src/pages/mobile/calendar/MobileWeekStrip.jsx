import { useMemo } from 'react'

const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function getWeekDays(weekStart) {
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    d.setHours(0, 0, 0, 0)
    days.push(d)
  }
  return days
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate()
}

/**
 * Strip orizzontale 7 giorni con dot density e bottoni glove-friendly.
 *
 * Le celle non mostrano le pillole intervento direttamente (troppo strette
 * sotto i 400px). Mostrano dot density (1-3 puntini) + numero giorno.
 * Tap = seleziona giorno → apre MobileDayContextSheet.
 *
 * Props
 *   weekStart           Date lunedì della settimana visualizzata
 *   selectedDay         Date oggi/selezionato
 *   interventions       array del mese, filtra per giorno in memoria
 *   onDayTap(date)      callback selezione
 */
export default function MobileWeekStrip({
  weekStart,
  selectedDay,
  interventions = [],
  onDayTap,
}) {
  const days = useMemo(() => getWeekDays(weekStart), [weekStart])
  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  // Aggrega count per giorno (1 sola passata)
  const countByDayKey = useMemo(() => {
    const map = new Map()
    for (const intv of interventions) {
      if (!intv.scheduled_start_at) continue
      const d = new Date(intv.scheduled_start_at)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      map.set(key, (map.get(key) || 0) + 1)
    }
    return map
  }, [interventions])

  return (
    <div
      role="tablist"
      aria-label="Settimana"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 6,
        padding: '0 4px',
      }}
    >
      {days.map((d, i) => {
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        const count = countByDayKey.get(dayKey) || 0
        const isSelected = selectedDay && isSameDay(d, selectedDay)
        const isToday = isSameDay(d, today)
        const isWeekend = i >= 5

        return (
          <button
            key={dayKey}
            role="tab"
            aria-selected={isSelected}
            aria-label={`${WEEKDAYS_SHORT[i]} ${d.getDate()}${count > 0 ? `, ${count} interventi` : ''}`}
            onClick={() => onDayTap?.(d)}
            className="press-scale"
            style={{
              minHeight: 72,
              padding: '8px 4px',
              background: isSelected
                ? 'var(--color-primary)'
                : isToday
                  ? 'rgba(124,106,255,0.10)'
                  : 'var(--color-surface-2)',
              border: `1px solid ${isSelected ? 'var(--color-primary)' : isToday ? 'rgba(124,106,255,0.40)' : 'var(--color-border)'}`,
              borderRadius: 12,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: isSelected ? '#fff' : isWeekend ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
            }}>
              {WEEKDAYS_SHORT[i]}
            </span>
            <span style={{
              fontSize: 20, fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace',
              color: isSelected ? '#fff' : isToday ? 'var(--color-primary)' : 'var(--color-text)',
              lineHeight: 1,
            }}>
              {d.getDate()}
            </span>
            <DotDensity count={count} active={isSelected} />
          </button>
        )
      })}
    </div>
  )
}

function DotDensity({ count, active }) {
  const dots = Math.min(count, 3)
  const color = active ? '#fff' : 'var(--color-primary)'
  return (
    <div style={{
      display: 'flex',
      gap: 3,
      minHeight: 6,
      alignItems: 'center',
    }}>
      {Array.from({ length: dots }).map((_, i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: 999,
          background: color,
          opacity: active ? 0.9 : 1,
        }} />
      ))}
      {count > 3 && (
        <span style={{
          fontSize: 9, fontWeight: 700,
          color,
          marginLeft: 2,
          fontFamily: '"JetBrains Mono", monospace',
        }}>+{count - 3}</span>
      )}
    </div>
  )
}

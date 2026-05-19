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

  // Aggrega per giorno: count + flag "hasCritical" così il dot indicator
  // può virare al rosso quando il giorno contiene almeno un intervento
  // critica (segnale immediato senza dover aprire il sheet).
  const dayMetaByKey = useMemo(() => {
    const map = new Map()
    for (const intv of interventions) {
      if (!intv.scheduled_start_at) continue
      const d = new Date(intv.scheduled_start_at)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const prev = map.get(key) || { count: 0, hasCritical: false }
      prev.count += 1
      if (intv.severity === 'critica') prev.hasCritical = true
      map.set(key, prev)
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
        const meta = dayMetaByKey.get(dayKey) || { count: 0, hasCritical: false }
        const isSelected = selectedDay && isSameDay(d, selectedDay)
        const isToday = isSameDay(d, today)
        const isWeekend = i >= 5

        return (
          <button
            key={dayKey}
            role="tab"
            aria-selected={isSelected}
            aria-label={`${WEEKDAYS_SHORT[i]} ${d.getDate()}${meta.count > 0 ? `, ${meta.count} interventi${meta.hasCritical ? ', uno critico' : ''}` : ''}`}
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
              border: `1px solid ${isSelected ? 'var(--color-primary)' : isToday ? 'rgba(124,106,255,0.40)' : '#52525b'}`,
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
              fontSize: 11, fontWeight: 800, letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: isSelected ? '#fff' : isWeekend ? '#a1a1aa' : '#d4d4d8',
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
            <DotDensity count={meta.count} hasCritical={meta.hasCritical} active={isSelected} />
          </button>
        )
      })}
    </div>
  )
}

function DotDensity({ count, hasCritical, active }) {
  const dots = Math.min(count, 3)
  // Critica → rosso brillante. Default → violet-400 (più chiaro del primary).
  // Selected day → bianco (su sfondo primary).
  const color = active
    ? '#fff'
    : hasCritical
      ? '#ef4444'
      : '#a78bfa'
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      minHeight: 10,
      alignItems: 'center',
    }}>
      {Array.from({ length: dots }).map((_, i) => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: 999,
          background: color,
        }} />
      ))}
      {count > 3 && (
        <span style={{
          fontSize: 10, fontWeight: 700,
          color,
          marginLeft: 2,
          fontFamily: '"JetBrains Mono", monospace',
        }}>+{count - 3}</span>
      )}
    </div>
  )
}

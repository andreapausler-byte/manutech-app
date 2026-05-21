// Vista mese del calendario admin. CSS Grid 7×N, settimana inizia lunedì.
// Ogni cella elenca gli interventi del giorno via <InterventionPill>.
// Tap su giorno → onDayClick(date). Tap su intervento → onInterventionClick(i).

import { useMemo } from 'react'
import InterventionPill from './InterventionPill'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

// Costruisce la matrice settimane × giorni per il mese richiesto.
// Lunedì come primo giorno della settimana (convenzione IT).
//
// Importante: la `key` di ogni cella usa getDate() LOCAL (non toISOString,
// che ritornerebbe UTC e shifterebbe di 1 giorno per chi sta a est di UTC).
// Le pillole degli interventi indicizzano per getDate() local: le due chiavi
// DEVONO essere generate con la stessa convention, altrimenti gli interventi
// finiscono sotto la cella sbagliata.
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
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      key: `${yyyy}-${mm}-${dd}`,
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

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Restituisce array di {key, date} con un elemento per ogni giorno locale
// coperto dall'intervento (inclusivo). Se end è null o uguale al giorno di
// start, ritorna un singolo elemento.
function spanDays(intv) {
  const start = new Date(intv.scheduled_start_at)
  const days = [{
    key: dayKey(start),
    date: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
  }]
  if (!intv.scheduled_end_at) return days
  const end = new Date(intv.scheduled_end_at)
  if (end <= start) return days
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  // Safety cap: 366 giorni — evita loop infiniti con dati corrotti
  let guard = 0
  while (cursor < endDay && guard++ < 366) {
    cursor.setDate(cursor.getDate() + 1)
    days.push({
      key: dayKey(cursor),
      date: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
    })
  }
  return days
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

  // Indicizza interventi per giorno (chiave YYYY-MM-DD). Per gli interventi
  // multi-day, viene inserito un entry in ogni giorno coperto dallo span
  // [scheduled_start_at, scheduled_end_at], con flag continuesLeft/Right
  // che la pillola usa per la resa "barra continua".
  //
  // Sort: multi-day prima dei single-day, così la stessa intervention occupa
  // lo stesso slot Y in tutti i suoi giorni e la barra visiva resta allineata
  // anche se altri interventi single-day esistono nei giorni intermedi.
  const byDay = useMemo(() => {
    const map = {}
    for (const i of interventions) {
      if (!i.scheduled_start_at) continue
      const days = spanDays(i)
      const lastIdx = days.length - 1
      days.forEach((d, idx) => {
        if (!map[d.key]) map[d.key] = []
        map[d.key].push({
          intervention: i,
          continuesLeft: idx > 0,
          continuesRight: idx < lastIdx,
        })
      })
    }
    const isMulti = (entry) => entry.continuesLeft || entry.continuesRight
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const aMulti = isMulti(a) ? 0 : 1
        const bMulti = isMulti(b) ? 0 : 1
        if (aMulti !== bMulti) return aMulti - bMulti
        return new Date(a.intervention.scheduled_start_at) - new Date(b.intervention.scheduled_start_at)
      })
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
        gridTemplateRows: `repeat(${weeks.length}, minmax(96px, 1fr))`,
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
                    // overflow-x: visible per far sborder le pillole multi-day
                    // verso le celle adiacenti (barra continua). overflow-y
                    // resta hidden per non sfondare verticalmente.
                    overflowX: 'visible',
                    overflowY: 'hidden',
                    position: 'relative',
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
                  <div style={{ flex: 1, overflowX: 'visible', overflowY: 'hidden' }}>
                    {items.slice(0, maxPillsPerCell).map(entry => {
                      const intv = entry.intervention
                      // Sui bordi di settimana la barra "spezza": l'ultima cella
                      // della riga non deve sborder a destra (non c'è cella
                      // adiacente lì), la prima della riga successiva non deve
                      // sborder a sinistra. Mantiene continuità solo intra-row.
                      const isLastInWeek = week[week.length - 1].key === cell.key
                      const isFirstInWeek = week[0].key === cell.key
                      const continuesRight = entry.continuesRight && !isLastInWeek
                      const continuesLeft = entry.continuesLeft && !isFirstInWeek
                      return (
                        <InterventionPill
                          key={intv.id}
                          intervention={intv}
                          active={intv.id === selectedInterventionId}
                          onClick={onInterventionClick}
                          continuesLeft={continuesLeft}
                          continuesRight={continuesRight}
                        />
                      )
                    })}
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

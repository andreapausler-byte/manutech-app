/**
 * PlanCalendar — le prossime 4 settimane, una riga per macchinario.
 *
 * Ogni quadratino è un piano nel giorno in cui scade; la colonna Scadute
 * raccoglie quelli già passati. Le macchine senza nulla in finestra non
 * occupano righe: i loro piani restano nella lista.
 */

import { EmptyBox } from './MaintenanceBits'
import { MONO, TONES, monoLabel, ellipsis } from './planUi'

const DAYS = 28
const WEEKDAY = ['D', 'L', 'M', 'M', 'G', 'V', 'S']

export default function PlanCalendar({ tasks, onSelect }) {
  const inWindow = tasks.filter(t => t.light.daysLeft < DAYS)
  if (!inWindow.length) {
    return <EmptyBox text="Nessun piano nei prossimi 28 giorni" hint={tasks.length ? 'Gli altri sono nella lista.' : null} />
  }

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })

  const rows = Object.values(inWindow.reduce((acc, t) => {
    const id = t.machine.id
    if (!acc[id]) acc[id] = { machine: t.machine, tasks: [] }
    acc[id].tasks.push(t)
    return acc
  }, {})).sort((a, b) => (a.machine.name || '').localeCompare(b.machine.name || '', 'it'))

  const later = tasks.length - inWindow.length
  const cols = `200px 72px repeat(${DAYS}, minmax(0,1fr))`
  const cell = { borderLeft: '1px solid var(--color-border)' }

  return (
    <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', overflowX: 'auto' }}>
      <div style={{ minWidth: 1000 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ ...monoLabel, padding: '10px 14px' }}>Macchinario</div>
          <div style={{ ...monoLabel, ...cell, color: 'var(--color-danger)', padding: '10px 6px', textAlign: 'center' }}>Scadute</div>
          {days.map((d, i) => {
            const weekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <div key={i} title={d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} style={{
                ...cell, textAlign: 'center', padding: '6px 0',
                background: i === 0 ? 'var(--color-green-bg)' : weekend ? 'var(--color-app-bg)' : undefined,
              }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--color-text-faint)' }}>{WEEKDAY[d.getDay()]}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: i === 0 ? 'var(--color-primary)' : 'var(--color-text)' }}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {rows.map(({ machine, tasks: mt }) => {
          const overdue = mt.filter(t => t.light.daysLeft < 0)
          return (
            <div key={machine.id} style={{ display: 'grid', gridTemplateColumns: cols, minHeight: 44, borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ padding: '10px 14px', alignSelf: 'center', fontSize: 13, color: 'var(--color-text)', ...ellipsis }}>{machine.name}</div>
              <div style={{
                ...cell, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, padding: 4,
                background: overdue.length ? 'var(--color-red-bg)' : undefined,
              }}>
                {overdue.map(t => <Chip key={t.plan.id} task={t} wide onClick={() => onSelect(t.plan.id)} />)}
              </div>
              {days.map((_, i) => (
                <div key={i} style={{ ...cell, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px 2px' }}>
                  {mt.filter(t => t.light.daysLeft === i).map(t => (
                    <Chip key={t.plan.id} task={t} onClick={() => onSelect(t.plan.id)} />
                  ))}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div style={{
        padding: '10px 14px', borderTop: '1px solid var(--color-border)',
        fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, color: 'var(--color-text-faint)',
      }}>
        PROSSIMI 28 GIORNI{later > 0 ? ` · ALTRI ${later} PIANI PIÙ AVANTI: SONO NELLA LISTA` : ''}
      </div>
    </div>
  )
}

function Chip({ task, wide, onClick }) {
  const tone = TONES[task.light.status]
  const text = `${task.plan.name} · ${task.light.label}`
  return (
    <button type="button" onClick={onClick} title={text} aria-label={text} style={{
      width: wide ? '100%' : 18, height: 18, padding: 0, cursor: 'pointer',
      background: tone.dim, border: `1px solid ${tone.color}`, color: tone.color,
      fontFamily: MONO, fontSize: 10, fontWeight: 600,
    }}>{wide ? `${-task.light.daysLeft}g` : ''}</button>
  )
}

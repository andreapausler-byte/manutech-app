// Picker data+ora per la pianificazione interventi (chip "Altra data…").
// Sostituisce l'<input type="datetime-local"> nativo, che su desktop è un
// campo minuscolo e su mobile apre il picker di sistema: qui serve un
// calendario leggibile anche con i guanti e — richiesta officina — con il
// NUMERO DELLA SETTIMANA ISO accanto a ogni riga, perché la produzione
// ragiona per settimane ("lo facciamo in S36").
//
// Il valore entra ed esce come stringa "YYYY-MM-DDTHH:MM" (stesso formato
// dell'input nativo), così i form che lo usano non cambiano logica.
//
// Pattern coerente col resto del progetto: Modal di ui/index.jsx, stili
// inline + CSS vars (no Tailwind config), tap target ≥44px, haptic al tap.

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Modal } from './index.jsx'
import { isoWeekNumber, toDatetimeLocalString } from '../../lib/interventions'
import { useHaptic } from '../../hooks/useHaptic'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const MONTH_LABELS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]
// Orari tipici di officina: inizio turno, metà mattina, dopo pranzo, sera.
const TIME_CHIPS = ['08:00', '09:00', '10:30', '13:00', '14:30', '16:00', '18:00']

// Matrice settimane × giorni del mese, lunedì primo giorno (convenzione IT).
// Stessa costruzione di CalendarMonthGrid: date LOCAL, mai toISOString, che
// per chi sta a est di UTC shifterebbe la cella di un giorno.
function buildMonthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startWeekday = (first.getDay() + 6) % 7 // lun=0 … dom=6
  const totalCells = Math.ceil((startWeekday + last.getDate()) / 7) * 7
  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, 1 + (i - startWeekday))
    cells.push({ date, inMonth: date.getMonth() === month })
  }
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function isSameDay(a, b) {
  return !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

// "HH:MM" valido → true. Serve perché l'input time può restare vuoto.
function isValidTime(t) {
  return typeof t === 'string' && /^\d{2}:\d{2}$/.test(t)
}

// Prossima mezz'ora tonda: default sensato quando non c'è già un valore.
function defaultTime(now = new Date()) {
  const d = new Date(now)
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.value] — "YYYY-MM-DDTHH:MM" (o '' se non impostato)
 * @param {(value: string) => void} props.onConfirm — riceve lo stesso formato
 * @param {string} [props.title='Scegli data e ora']
 * @param {string} [props.confirmLabel='Conferma']
 */
export default function DateTimePicker({
  open,
  onClose,
  value = '',
  onConfirm,
  title = 'Scegli data e ora',
  confirmLabel = 'Conferma',
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {/* Il corpo vive solo mentre il modal è aperto e si rimonta se cambia
          il valore in ingresso: così lo stato interno parte SEMPRE da `value`
          senza un useEffect di sync (che, con una prop non stabile, si
          ri-scatenerebbe a ogni render azzerando la scelta appena fatta). */}
      <PickerBody
        key={`${open ? 'open' : 'closed'}:${value}`}
        value={value}
        onConfirm={onConfirm}
        onClose={onClose}
        confirmLabel={confirmLabel}
      />
    </Modal>
  )
}

function PickerBody({ value, onConfirm, onClose, confirmLabel }) {
  const haptic = useHaptic()
  // Valore iniziale: quello già impostato, altrimenti oggi alla prossima
  // mezz'ora tonda.
  const [initial] = useState(() => {
    const parsed = value ? new Date(value) : null
    const isSet = parsed && !isNaN(parsed.getTime())
    const base = isSet ? parsed : new Date()
    return {
      day: new Date(base.getFullYear(), base.getMonth(), base.getDate()),
      time: isSet
        ? `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`
        : defaultTime(),
    }
  })

  const [selected, setSelected] = useState(initial.day)  // Date (giorno)
  const [time, setTime] = useState(initial.time)         // "HH:MM"
  const [viewYear, setViewYear] = useState(initial.day.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.day.getMonth())

  const weeks = useMemo(() => buildMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth])
  const today = useMemo(() => new Date(), [])

  const shiftMonth = (delta) => {
    haptic.light?.()
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const goToday = () => {
    haptic.light?.()
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    setSelected(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  }

  const pickDay = (date) => {
    haptic.light?.()
    setSelected(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
    // Tap su un giorno fuori mese → il calendario segue il mese scelto,
    // altrimenti la selezione sparirebbe dalla vista.
    if (date.getMonth() !== viewMonth) {
      setViewYear(date.getFullYear())
      setViewMonth(date.getMonth())
    }
  }

  // Riga riepilogo + valore restituito: "gio 3 set 2026 · S36 · 16:00"
  const recap = useMemo(() => {
    if (!selected) return null
    const label = selected.toLocaleDateString('it-IT', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })
    return `${label} · S${isoWeekNumber(selected)} · ${isValidTime(time) ? time : '--:--'}`
  }, [selected, time])

  const canConfirm = !!selected && isValidTime(time)

  const handleConfirm = () => {
    if (!canConfirm) return
    haptic.medium?.()
    const [hh, mm] = time.split(':').map(Number)
    const out = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), hh, mm, 0, 0)
    onConfirm?.(toDatetimeLocalString(out))
    onClose?.()
  }

  return (
    <>
      {/* Header mese: ‹ Agosto 2026 › + scorciatoia Oggi */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 10,
      }}>
        <button
          type="button" onClick={() => shiftMonth(-1)}
          aria-label="Mese precedente" className="press-scale"
          style={navBtnStyle}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {MONTH_LABELS[viewMonth]} {viewYear}
          </p>
        </div>
        <button
          type="button" onClick={goToday} className="press-scale"
          style={{
            ...navBtnStyle, width: 'auto', padding: '0 12px',
            fontSize: 12, fontWeight: 700,
          }}
        >
          Oggi
        </button>
        <button
          type="button" onClick={() => shiftMonth(1)}
          aria-label="Mese successivo" className="press-scale"
          style={navBtnStyle}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Intestazione colonne: S (settimana ISO) + Lun…Dom */}
      <div style={{ ...gridStyle, marginBottom: 2 }}>
        <div style={{ ...headCellStyle, color: 'var(--color-text-muted)' }} title="Settimana ISO">S</div>
        {WEEKDAY_LABELS.map(w => (
          <div key={w} style={headCellStyle}>{w}</div>
        ))}
      </div>

      {/* Griglia giorni */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {weeks.map(week => (
          <div key={`${week[0].date.getFullYear()}-${week[0].date.getMonth()}-${week[0].date.getDate()}`} style={gridStyle}>
            {/* Numero settimana ISO — calcolato sul giovedì della riga */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace',
              color: 'var(--color-text-muted)',
              background: 'var(--color-surface-2)',
              borderRadius: 8,
            }}>
              {isoWeekNumber(week[3].date)}
            </div>
            {week.map(cell => {
              const isSel = isSameDay(cell.date, selected)
              const isToday = isSameDay(cell.date, today)
              return (
                <button
                  key={`${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`}
                  type="button"
                  onClick={() => pickDay(cell.date)}
                  className="press-scale"
                  aria-label={cell.date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  aria-pressed={isSel}
                  style={{
                    minHeight: 44,
                    borderRadius: 10,
                    background: isSel ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    border: `1px solid ${isSel
                      ? 'var(--color-primary)'
                      : isToday ? 'var(--color-primary)' : 'transparent'}`,
                    color: isSel
                      ? '#fff'
                      : cell.inMonth ? 'var(--color-text)' : 'var(--color-text-muted)',
                    opacity: cell.inMonth || isSel ? 1 : 0.45,
                    fontSize: 14,
                    fontWeight: isSel || isToday ? 700 : 500,
                    fontFamily: '"JetBrains Mono", monospace',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {cell.date.getDate()}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Ora: chip rapidi + input per l'orario preciso */}
      <div style={{ marginTop: 14 }}>
        <p style={{
          display: 'flex', alignItems: 'center', gap: 5,
          margin: '0 0 6px',
          fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
          textTransform: 'uppercase', color: 'var(--color-text-secondary)',
        }}>
          <Clock size={11} /> Ora
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {TIME_CHIPS.map(t => {
            const active = time === t
            return (
              <button
                key={t} type="button"
                onClick={() => { haptic.light?.(); setTime(t) }}
                className="press-scale"
                style={{
                  minHeight: 36, padding: '7px 11px', borderRadius: 999,
                  background: active ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  color: active ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                {t}
              </button>
            )
          })}
          <input
            type="time"
            value={isValidTime(time) ? time : ''}
            onChange={e => setTime(e.target.value)}
            aria-label="Orario personalizzato"
            style={{
              minHeight: 36, padding: '6px 10px',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 999,
              color: 'var(--color-text)',
              fontSize: 12, fontWeight: 600,
              fontFamily: '"JetBrains Mono", monospace',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Footer: riepilogo + conferma */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginTop: 16, paddingTop: 12,
        borderTop: '1px solid var(--color-border)',
      }}>
        <span style={{
          fontSize: 12, color: 'var(--color-text-secondary)',
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {recap || 'Nessuna data selezionata'}
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="press-scale"
          style={{
            flexShrink: 0,
            padding: '10px 18px', borderRadius: 10,
            background: canConfirm ? 'var(--color-primary)' : 'var(--color-surface-2)',
            border: 'none',
            color: canConfirm ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 13, fontWeight: 700,
            cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </>
  )
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '30px repeat(7, 1fr)',
  gap: 2,
}

const headCellStyle = {
  textAlign: 'center',
  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
  padding: '4px 0',
}

const navBtnStyle = {
  width: 36, height: 36,
  flexShrink: 0,
  borderRadius: 10,
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

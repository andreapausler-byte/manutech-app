import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, EyeOff, Eye } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useInterventionsCalendar } from '../../../hooks/useInterventionsCalendar'
import MobileWeekStrip from './MobileWeekStrip'
import MobileDayContextSheet from './MobileDayContextSheet'
import MobileMonthMicroOverlay from './MobileMonthMicroOverlay'

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

function startOfWeek(d) {
  const date = new Date(d)
  // Italiano: settimana parte da lunedì
  const day = date.getDay()
  const offset = (day + 6) % 7
  date.setDate(date.getDate() - offset)
  date.setHours(0, 0, 0, 0)
  return date
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

/**
 * Calendario mobile per tecnico/operatore.
 *
 * Phase 1b-A: week-strip + day list + overlay mini-mese per quick-jump.
 * Bottom sheet `MobileDayContextSheet` per il dettaglio del giorno con pillole
 * 56px glove-friendly e bottone "Apri report" condizionale (parità 1c-bis).
 *
 * Props per hydration esterna (oggi non popolati, riservati per Phase B +
 * deep link da push notification):
 *   initialMonth, initialOpenDay, initialHighlightInterventionId,
 *   forceShowCancelledOnce, onOpenReport(reportId)
 */
export default function CalendarioMobile({
  initialMonth,
  initialOpenDay,
  initialHighlightInterventionId,
  forceShowCancelledOnce,
  onOpenReport,
}) {
  const { user } = useAuth()

  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  const [currentMonth, setCurrentMonth] = useState(() => initialMonth || startOfMonth(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialOpenDay || new Date()))
  const [selectedDay, setSelectedDay] = useState(() => initialOpenDay || today)
  // Fix UX 1b-A: sheet è la single source of truth per il giorno.
  // Apre automaticamente al mount (anche se selectedDay === today) così
  // l'utente vede subito gli interventi senza dover toccare la strip.
  const [sheetOpen, setSheetOpen] = useState(true)
  const [overlayOpen, setOverlayOpen] = useState(false)

  const [showCancelled, setShowCancelled] = useState(() => {
    try { return localStorage.getItem('manutech_mobile_calendar_show_cancelled') === 'true' }
    catch { return false }
  })
  const [showCancelledOverride, setShowCancelledOverride] = useState(null)
  const effectiveShowCancelled = showCancelledOverride ?? showCancelled
  useEffect(() => {
    try { localStorage.setItem('manutech_mobile_calendar_show_cancelled', String(showCancelled)) }
    catch { /* storage non disponibile */ }
  }, [showCancelled])

  const [arrivedHighlightId, setArrivedHighlightId] = useState(
    initialHighlightInterventionId || null
  )

  // Hydration una sola volta al mount (pattern simmetrico a AdminCalendar).
  const didHydrateRef = useRef(false)
  useEffect(() => {
    if (didHydrateRef.current) return
    didHydrateRef.current = true
    if (forceShowCancelledOnce) setShowCancelledOverride(true)
    if (initialOpenDay) setSheetOpen(true)
  }, [forceShowCancelledOnce, initialOpenDay])

  // Fetch interventi del mese visualizzato
  const { rangeStart, rangeEnd } = useMemo(() => ({
    rangeStart: startOfMonth(currentMonth),
    rangeEnd: endOfMonth(currentMonth),
  }), [currentMonth])

  // Scope: tecnico vede solo i suoi, operatore vede tutti (read-only),
  // admin (caso raro su mobile) vede tutti.
  const scope = user?.role === 'tecnico' ? 'mine' : 'all'

  const { interventions, loading } = useInterventionsCalendar({
    rangeStart,
    rangeEnd,
    scope,
    currentUserId: user?.id,
  })

  const visibleInterventions = useMemo(() => {
    if (effectiveShowCancelled) return interventions
    return (interventions || []).filter(i => i.status !== 'annullato')
  }, [interventions, effectiveShowCancelled])

  const hiddenCancelledCount = useMemo(() => {
    if (effectiveShowCancelled) return 0
    return (interventions || []).filter(i => i.status === 'annullato').length
  }, [interventions, effectiveShowCancelled])

  // Filtra per giorno selezionato (dal pool VISIBLE, così il toggle agisce
  // anche sul sheet — diverso da desktop dove DayContextPanel ignora il
  // filtro perché è un accesso esplicito. Su mobile la coerenza UX vince.)
  // Sort: critica in cima (priorità assoluta), poi orario crescente.
  const dayInterventions = useMemo(() => {
    if (!selectedDay) return []
    return visibleInterventions
      .filter(intv => {
        if (!intv.scheduled_start_at) return false
        const d = new Date(intv.scheduled_start_at)
        return d.getFullYear() === selectedDay.getFullYear()
          && d.getMonth() === selectedDay.getMonth()
          && d.getDate() === selectedDay.getDate()
      })
      .sort((a, b) => {
        const aCrit = a.severity === 'critica' ? 0 : 1
        const bCrit = b.severity === 'critica' ? 0 : 1
        if (aCrit !== bCrit) return aCrit - bCrit
        return new Date(a.scheduled_start_at) - new Date(b.scheduled_start_at)
      })
  }, [visibleInterventions, selectedDay])

  const goPrevWeek = () => {
    setWeekStart(d => {
      const nd = new Date(d)
      nd.setDate(d.getDate() - 7)
      if (!sameMonth(nd, currentMonth)) setCurrentMonth(startOfMonth(nd))
      return nd
    })
    setArrivedHighlightId(null)
  }
  const goNextWeek = () => {
    setWeekStart(d => {
      const nd = new Date(d)
      nd.setDate(d.getDate() + 7)
      if (!sameMonth(nd, currentMonth)) setCurrentMonth(startOfMonth(nd))
      return nd
    })
    setArrivedHighlightId(null)
  }
  const goToday = () => {
    const t = new Date()
    setCurrentMonth(startOfMonth(t))
    setWeekStart(startOfWeek(t))
    setSelectedDay(today)
    setArrivedHighlightId(null)
  }

  const handleDayTap = (date) => {
    setSelectedDay(date)
    if (!sameMonth(date, currentMonth)) setCurrentMonth(startOfMonth(date))
    setSheetOpen(true)
    setArrivedHighlightId(null)
  }

  const handleOverlayDaySelect = (date) => {
    setOverlayOpen(false)
    setCurrentMonth(startOfMonth(date))
    setWeekStart(startOfWeek(date))
    setSelectedDay(date)
    setSheetOpen(true)
    setArrivedHighlightId(null)
  }

  const handleOpenReport = (reportId) => {
    if (!reportId) return
    onOpenReport?.(reportId)
  }

  const monthLabel = `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
  const weekLabel = useMemo(() => {
    const end = new Date(weekStart)
    end.setDate(weekStart.getDate() + 6)
    const sd = weekStart.getDate()
    const ed = end.getDate()
    if (sameMonth(weekStart, end)) return `${sd}–${ed} ${MONTHS[weekStart.getMonth()].slice(0, 3)}`
    return `${sd} ${MONTHS[weekStart.getMonth()].slice(0, 3)} – ${ed} ${MONTHS[end.getMonth()].slice(0, 3)}`
  }, [weekStart])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      padding: '12px 12px 24px',
      background: 'var(--color-app-bg)',
    }}>
      {/* Header: mese tappabile (apre overlay) + bottoni nav settimana */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 12,
      }}>
        <button
          onClick={() => setOverlayOpen(true)}
          aria-label={`Apri mini calendario di ${monthLabel}`}
          className="press-scale"
          style={{
            flex: 1,
            minHeight: 48,
            padding: '8px 12px',
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            color: 'var(--color-text)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
          }}>
          <CalendarIcon size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          <span style={{
            fontSize: 14, fontWeight: 700,
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: -0.2,
            flex: 1, textAlign: 'left',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {monthLabel}
          </span>
        </button>
        <button
          onClick={goToday}
          className="press-scale"
          style={{
            minHeight: 48, padding: '0 14px', borderRadius: 12,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
          }}>
          Oggi
        </button>
      </div>

      {/* Toolbar settimana */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
      }}>
        <button
          onClick={goPrevWeek}
          aria-label="Settimana precedente"
          className="press-scale"
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{
          flex: 1, textAlign: 'center',
          fontSize: 12, fontWeight: 700,
          color: 'var(--color-text-secondary)',
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}>
          {weekLabel}
        </div>
        <button
          onClick={goNextWeek}
          aria-label="Settimana successiva"
          className="press-scale"
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
          <ChevronRight size={18} />
        </button>
      </div>

      <MobileWeekStrip
        weekStart={weekStart}
        selectedDay={selectedDay}
        interventions={visibleInterventions}
        onDayTap={handleDayTap}
      />

      {/* Toggle Mostra annullati + counter */}
      <div style={{
        marginTop: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8,
      }}>
        <button
          onClick={() => {
            setShowCancelledOverride(null)
            setShowCancelled(v => !v)
          }}
          className="press-scale"
          aria-pressed={effectiveShowCancelled}
          style={{
            minHeight: 40,
            padding: '8px 12px', borderRadius: 10,
            background: effectiveShowCancelled ? 'rgba(245,158,11,0.15)' : 'var(--color-surface-2)',
            border: `1px solid ${effectiveShowCancelled ? 'rgba(245,158,11,0.40)' : 'var(--color-border)'}`,
            color: effectiveShowCancelled ? '#f59e0b' : 'var(--color-text-secondary)',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          {effectiveShowCancelled ? <Eye size={14} /> : <EyeOff size={14} />}
          {effectiveShowCancelled ? 'Annullati visibili' : 'Annullati nascosti'}
          {!effectiveShowCancelled && hiddenCancelledCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 800,
              padding: '1px 5px', borderRadius: 999,
              background: 'rgba(245,158,11,0.25)', color: '#f59e0b',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              {hiddenCancelledCount}
            </span>
          )}
        </button>
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            Caricamento…
          </span>
        )}
      </div>

      {/* CTA per riaprire il sheet se l'utente lo ha chiuso (single source
          of truth = sheet). Visibile solo se sheet è chiuso. Il giorno è
          comunque selezionato nella week-strip. */}
      {!sheetOpen && (
        <div style={{ marginTop: 16, padding: '0 4px' }}>
          <button
            onClick={() => setSheetOpen(true)}
            className="press-scale"
            style={{
              width: '100%', minHeight: 48,
              padding: '10px 12px', borderRadius: 12,
              background: 'var(--color-surface-1)',
              border: '1px dashed var(--color-border)',
              color: 'var(--color-text-secondary)',
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}>
            Mostra interventi del giorno
          </button>
        </div>
      )}

      <MobileDayContextSheet
        open={sheetOpen}
        date={selectedDay}
        dayInterventions={dayInterventions}
        onClose={() => setSheetOpen(false)}
        onOpenReport={handleOpenReport}
        highlightedInterventionId={arrivedHighlightId}
      />

      <MobileMonthMicroOverlay
        open={overlayOpen}
        currentMonth={currentMonth}
        interventions={visibleInterventions}
        onClose={() => setOverlayOpen(false)}
        onDaySelect={handleOverlayDaySelect}
        onPrevMonth={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
        onNextMonth={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
      />
    </div>
  )
}


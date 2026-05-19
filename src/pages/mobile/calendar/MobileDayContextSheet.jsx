import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Calendar as CalendarIcon } from 'lucide-react'
import MobileInterventionPillola from './MobileInterventionPillola'

const SWIPE_DOWN_THRESHOLD = 80

/**
 * Bottom sheet mobile equivalente a DayContextPanel sidebar desktop.
 *
 * Pattern UX (briefing § 3.4):
 *   - slide-up animato all'apertura
 *   - backdrop semitrasparente, tap = chiude
 *   - swipe down ≥80px sull'header = chiude
 *   - header sticky con data + bottone X (48×48 glove-friendly)
 *   - body scrollabile, ogni pillola alta 56px
 *
 * Props
 *   open                bool
 *   date                Date selezionata
 *   dayInterventions    array già filtrato sul giorno
 *   onClose()
 *   onOpenIntervention(id)  tap pillola (apre detail / naviga)
 *   onOpenReport(reportId)  scorciatoia diretta al report (N=1 risolutivo)
 *   highlightedInterventionId  bordo evidenziato (deep link)
 */
export default function MobileDayContextSheet({
  open,
  date,
  dayInterventions = [],
  onClose,
  onOpenIntervention,
  onOpenReport,
  highlightedInterventionId,
}) {
  const [touchStartY, setTouchStartY] = useState(null)
  const [touchDeltaY, setTouchDeltaY] = useState(0)
  const sheetRef = useRef(null)

  // Reset drag state quando il sheet apre/chiude
  useEffect(() => {
    if (!open) {
      setTouchStartY(null)
      setTouchDeltaY(0)
    }
  }, [open])

  // ESC chiude su browser desktop di test
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const dateLabelLong = useMemo(() => {
    if (!date) return ''
    return date.toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
  }, [date])

  const count = dayInterventions.length

  const handleTouchStart = (e) => {
    setTouchStartY(e.touches[0].clientY)
    setTouchDeltaY(0)
  }
  const handleTouchMove = (e) => {
    if (touchStartY == null) return
    const delta = e.touches[0].clientY - touchStartY
    if (delta > 0) setTouchDeltaY(delta)
  }
  const handleTouchEnd = () => {
    if (touchDeltaY >= SWIPE_DOWN_THRESHOLD) {
      onClose?.()
    } else {
      setTouchDeltaY(0)
    }
    setTouchStartY(null)
  }

  if (!open) return null

  const sheetTransform = touchDeltaY > 0
    ? `translateY(${touchDeltaY}px)`
    : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Interventi di ${dateLabelLong}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
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
        ref={sheetRef}
        className="animate-slide-up"
        style={{
          position: 'relative',
          background: 'var(--color-surface-1)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.3)',
          transform: sheetTransform,
          transition: touchStartY == null ? 'transform 0.2s ease' : 'none',
        }}
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            flexShrink: 0,
            padding: '12px 16px 8px',
            borderBottom: '1px solid var(--color-border)',
            cursor: 'grab',
            touchAction: 'pan-y',
          }}
        >
          <div style={{
            width: 40, height: 4, borderRadius: 999,
            background: 'var(--color-border)',
            margin: '0 auto 12px',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', color: 'var(--color-text-secondary)',
                margin: 0,
              }}>Giorno</p>
              <p style={{
                fontSize: 16, fontWeight: 700, color: 'var(--color-text)',
                margin: '2px 0 0', textTransform: 'capitalize',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {dateLabelLong}
              </p>
              <p style={{
                fontSize: 12, color: 'var(--color-text-secondary)',
                margin: '2px 0 0',
              }}>
                {count === 0
                  ? 'Nessun intervento pianificato'
                  : `${count} intervent${count === 1 ? 'o' : 'i'} pianificat${count === 1 ? 'o' : 'i'}`}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Chiudi pannello giorno"
              className="press-scale"
              style={{
                flexShrink: 0,
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto',
          padding: '12px 16px',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        }}>
          {count === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '32px 12px',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
            }}>
              <CalendarIcon size={28} style={{ opacity: 0.4 }} />
              <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                Nessun intervento pianificato per questo giorno.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dayInterventions.map(intv => (
                <MobileInterventionPillola
                  key={intv.id}
                  intervention={intv}
                  onClick={() => onOpenIntervention?.(intv.id)}
                  onOpenReport={onOpenReport}
                  highlighted={intv.id === highlightedInterventionId}
                  dim={['annullato', 'completato'].includes(intv.status)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

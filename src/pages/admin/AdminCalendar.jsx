// Calendario admin — vista Mese con interventi pianificati.
//
// Layout 3 colonne:
//   - sinistra (fissa, opzionale): view switcher + filtri (placeholder Sprint 1a)
//   - centro (flex): griglia mese
//   - destra (sidebar): pannello contestuale (detail | pending fornitori)
//
// Le viste Settimana/Giorno/Agenda/Risorse sono UI presenti ma non funzionanti:
// al click mostrano un toast "Disponibile prossimamente".

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Users as UsersIcon } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useInterventionsCalendar } from '../../hooks/useInterventionsCalendar'
import CalendarMonthGrid from '../../components/interventions/CalendarMonthGrid'
import InterventionDetailPanel from '../../components/interventions/InterventionDetailPanel'
import PendingSuppliersPanel from '../../components/interventions/PendingSuppliersPanel'

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const VIEWS = [
  { id: 'mese', label: 'Mese', enabled: true },
  { id: 'settimana', label: 'Settimana', enabled: false },
  { id: 'giorno', label: 'Giorno', enabled: false },
  { id: 'agenda', label: 'Agenda', enabled: false },
  { id: 'risorse', label: 'Risorse', enabled: false },
]

export default function AdminCalendar({ onNavigate }) {
  const { user } = useAuth()
  const toast = useToast()
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [selectedInterventionId, setSelectedInterventionId] = useState(null)
  const [sidebarMode, setSidebarMode] = useState('hidden') // 'hidden' | 'detail' | 'pending'
  const [view, setView] = useState('mese')

  const { rangeStart, rangeEnd } = useMemo(() => {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    return {
      rangeStart: new Date(y, m, 1, 0, 0, 0),
      rangeEnd: new Date(y, m + 1, 0, 23, 59, 59),
    }
  }, [currentMonth])

  const { interventions, loading } = useInterventionsCalendar({
    rangeStart,
    rangeEnd,
    scope: 'all',
    currentUserId: user?.id,
  })

  const goPrev = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const goNext = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToday = () => setCurrentMonth(new Date())

  const handleView = (v) => {
    if (v.enabled) {
      setView(v.id)
    } else {
      toast.info(`Vista "${v.label}" disponibile prossimamente`, { icon: '🛠️' })
    }
  }

  const handleInterventionClick = (intv) => {
    setSelectedInterventionId(intv.id)
    setSidebarMode('detail')
  }

  const handleOpenPending = () => {
    setSidebarMode(prev => prev === 'pending' ? 'hidden' : 'pending')
    setSelectedInterventionId(null)
  }

  const handleOpenReport = (reportId) => {
    if (onNavigate) onNavigate('reports', { reportId })
  }

  const title = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      background: 'var(--color-app-bg)',
    }}>
      {/* Toolbar */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface-1)',
      }}>
        {/* Mese nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={goPrev} aria-label="Mese precedente" className="press-scale"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={goToday} className="press-scale"
            style={{
              padding: '6px 10px', borderRadius: 8,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}>
            Oggi
          </button>
          <button onClick={goNext} aria-label="Mese successivo" className="press-scale"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Titolo mese */}
        <h1 style={{
          fontSize: 20, fontWeight: 700, color: 'var(--color-text)',
          margin: 0, lineHeight: 1.1,
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: -0.3,
        }}>{title}</h1>

        {/* View switcher */}
        <div style={{
          marginLeft: 16,
          display: 'flex', gap: 2,
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 2,
        }}>
          {VIEWS.map(v => {
            const active = view === v.id
            return (
              <button key={v.id} onClick={() => handleView(v)}
                className="press-scale"
                style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: active ? 'var(--color-primary)' : 'transparent',
                  color: active ? '#fff' : v.enabled ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  opacity: v.enabled ? 1 : 0.6,
                }}>
                {v.label}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Pending fornitori toggle */}
        <button onClick={handleOpenPending} className="press-scale"
          style={{
            padding: '7px 12px', borderRadius: 8,
            background: sidebarMode === 'pending' ? 'var(--color-primary)' : 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: sidebarMode === 'pending' ? '#fff' : 'var(--color-text)',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <UsersIcon size={14} /> Fornitori in attesa
        </button>

        {/* Nuovo intervento → in Sprint 1a si crea solo da ReportDetail */}
        <button onClick={() => toast.info('Crea da una segnalazione: apri il report e usa "Pianifica intervento"', { icon: 'ℹ️' })}
          className="press-scale"
          style={{
            padding: '7px 12px', borderRadius: 8,
            background: 'var(--color-primary)',
            border: 'none',
            color: '#fff',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <Plus size={14} /> Nuovo intervento
        </button>
      </div>

      {/* Body: griglia + sidebar */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex',
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Banner informativo quando il mese è vuoto — non nasconde la griglia */}
          {!loading && interventions.length === 0 && (
            <div style={{
              flexShrink: 0,
              padding: '8px 20px',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              background: 'rgba(124,106,255,0.06)',
              borderBottom: '1px solid var(--color-border)',
              fontStyle: 'italic',
            }}>
              Nessun intervento in questo mese. Crea da una segnalazione: apri il report → <strong style={{ color: 'var(--color-text)', fontStyle: 'normal' }}>Pianifica intervento</strong>.
            </div>
          )}
          <CalendarMonthGrid
            year={currentMonth.getFullYear()}
            month={currentMonth.getMonth()}
            interventions={loading ? [] : interventions}
            onInterventionClick={handleInterventionClick}
            selectedInterventionId={selectedInterventionId}
            onDayClick={() => { /* Sprint 1a: nessuna creazione diretta da cella */ }}
          />
        </div>

        {sidebarMode !== 'hidden' && (
          <aside style={{
            width: 360,
            flexShrink: 0,
            borderLeft: '1px solid var(--color-border)',
          }}>
            {sidebarMode === 'detail' && (
              <InterventionDetailPanel
                interventionId={selectedInterventionId}
                onClose={() => { setSelectedInterventionId(null); setSidebarMode('hidden') }}
                onOpenReport={handleOpenReport}
              />
            )}
            {sidebarMode === 'pending' && (
              <PendingSuppliersPanel
                onClose={() => setSidebarMode('hidden')}
                onSelect={(id) => { setSelectedInterventionId(id); setSidebarMode('detail') }}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

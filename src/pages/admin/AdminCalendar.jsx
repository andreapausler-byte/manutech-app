// Calendario admin — vista Mese con interventi pianificati.
//
// Layout: griglia mese al centro + sidebar destra a 4 modalità.
//
// State machine sidebar (Sprint 1a-bis):
//   sidebar = { mode, ...payload }
//     'hidden'      → no sidebar
//     'pending'     → PendingSuppliersPanel (toggle dal toolbar)
//     'detail'      → InterventionDetailPanel sull'interventionId
//     'day'         → DayContextPanel sulla data (click su cella mese)
//     'create'      → InterventionRequestSidePanel (Nuovo per data | + Abbina)
//     'reschedule'  → InterventionRequestSidePanel in edit mode
//
// Principio inviolabile: NIENTE modal sopra il calendario. Tutto in sidebar.
// Il calendario centrale resta sempre visibile.
//
// Sprint 1a: solo vista Mese funzionante. Settimana/Giorno/Agenda/Risorse
// sono UI placeholders che mostrano toast "Disponibile prossimamente".

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Users as UsersIcon } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useInterventionsCalendar } from '../../hooks/useInterventionsCalendar'
import CalendarMonthGrid from '../../components/interventions/CalendarMonthGrid'
import InterventionDetailPanel from '../../components/interventions/InterventionDetailPanel'
import PendingSuppliersPanel from '../../components/interventions/PendingSuppliersPanel'
import DayContextPanel from '../../components/interventions/DayContextPanel'
import InterventionRequestSidePanel from '../../components/interventions/InterventionRequestSidePanel'

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
  const [sidebar, setSidebar] = useState({ mode: 'hidden' })
  const [view, setView] = useState('mese')

  const { rangeStart, rangeEnd } = useMemo(() => {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    return {
      rangeStart: new Date(y, m, 1, 0, 0, 0),
      rangeEnd: new Date(y, m + 1, 0, 23, 59, 59),
    }
  }, [currentMonth])

  const { interventions, loading, refetch } = useInterventionsCalendar({
    rangeStart,
    rangeEnd,
    scope: 'all',
    currentUserId: user?.id,
  })

  // ── Navigazione mese ──
  const goPrev = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const goNext = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToday = () => setCurrentMonth(new Date())

  const handleView = (v) => {
    if (v.enabled) setView(v.id)
    else toast.info(`Vista "${v.label}" disponibile prossimamente`, { icon: '🛠️' })
  }

  // ── Sidebar transitions ──
  const closeSidebar = () => setSidebar({ mode: 'hidden' })
  const openDetail = (interventionId) => setSidebar({ mode: 'detail', interventionId })
  const openDay = (date) => setSidebar({ mode: 'day', date })
  const openCreateForDay = (date) => setSidebar({ mode: 'create', createPrefillDate: date })
  const openCreateBase = (baseIntervention) => setSidebar({ mode: 'create', createBaseIntervention: baseIntervention })
  const openCreateNew = () => setSidebar({ mode: 'create', createPrefillDate: new Date() })
  const openReschedule = (intervention) => setSidebar({ mode: 'reschedule', rescheduleIntervention: intervention })
  const togglePending = () => setSidebar(s => s.mode === 'pending' ? { mode: 'hidden' } : { mode: 'pending' })

  const handleOpenReport = (reportId) => {
    if (onNavigate) onNavigate('reports', { reportId })
  }

  // Post-create / post-reschedule: aggiorna lista e passa a detail
  const handleCreated = async (newIntervention) => {
    await refetch?.()
    if (newIntervention?.id) openDetail(newIntervention.id)
    else closeSidebar()
  }
  const handleUpdated = async (interventionId) => {
    await refetch?.()
    openDetail(interventionId)
  }

  // Highlight della griglia: l'intervento attivo è quello in modalità Detail
  const highlightedInterventionId = sidebar.mode === 'detail' ? sidebar.interventionId : null

  const title = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
  const sidebarVisible = sidebar.mode !== 'hidden'

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

        <h1 style={{
          fontSize: 20, fontWeight: 700, color: 'var(--color-text)',
          margin: 0, lineHeight: 1.1,
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: -0.3,
        }}>{title}</h1>

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

        <button onClick={togglePending} className="press-scale"
          style={{
            padding: '7px 12px', borderRadius: 8,
            background: sidebar.mode === 'pending' ? 'var(--color-primary)' : 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: sidebar.mode === 'pending' ? '#fff' : 'var(--color-text)',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <UsersIcon size={14} /> Fornitori in attesa
        </button>

        <button onClick={openCreateNew} className="press-scale"
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
              Nessun intervento in questo mese. Clicca un giorno per crearne uno o usa <strong style={{ color: 'var(--color-text)', fontStyle: 'normal' }}>Nuovo intervento</strong>.
            </div>
          )}
          <CalendarMonthGrid
            year={currentMonth.getFullYear()}
            month={currentMonth.getMonth()}
            interventions={loading ? [] : interventions}
            onInterventionClick={(intv) => openDetail(intv.id)}
            selectedInterventionId={highlightedInterventionId}
            onDayClick={(date) => openDay(date)}
          />
        </div>

        {sidebarVisible && (
          <aside style={{
            width: 380,
            flexShrink: 0,
            borderLeft: '1px solid var(--color-border)',
          }}>
            {sidebar.mode === 'detail' && (
              <InterventionDetailPanel
                interventionId={sidebar.interventionId}
                onClose={closeSidebar}
                onOpenReport={handleOpenReport}
                onReschedule={openReschedule}
                onMatch={openCreateBase}
              />
            )}
            {sidebar.mode === 'pending' && (
              <PendingSuppliersPanel
                onClose={closeSidebar}
                onSelect={openDetail}
              />
            )}
            {sidebar.mode === 'day' && (
              <DayContextPanel
                date={sidebar.date}
                monthInterventions={interventions}
                onClose={closeSidebar}
                onSelectIntervention={openDetail}
                onCreateForDay={openCreateForDay}
                onMatchIntervention={openCreateBase}
              />
            )}
            {sidebar.mode === 'create' && (
              <InterventionRequestSidePanel
                user={user}
                prefillDate={sidebar.createPrefillDate || null}
                baseIntervention={sidebar.createBaseIntervention || null}
                onClose={closeSidebar}
                onCreated={handleCreated}
              />
            )}
            {sidebar.mode === 'reschedule' && (
              <InterventionRequestSidePanel
                mode="reschedule"
                user={user}
                existingIntervention={sidebar.rescheduleIntervention}
                onClose={closeSidebar}
                onUpdated={handleUpdated}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

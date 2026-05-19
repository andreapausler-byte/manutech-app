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

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Users as UsersIcon, EyeOff, Eye } from 'lucide-react'
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

export default function AdminCalendar({
  onNavigate,
  initialMonth,
  initialOpenDay,
  initialHighlightInterventionId,
  forceShowCancelledOnce,
}) {
  const { user } = useAuth()
  const toast = useToast()
  const [currentMonth, setCurrentMonth] = useState(() => initialMonth || new Date())
  const [sidebar, setSidebar] = useState({ mode: 'hidden' })
  const [view, setView] = useState('mese')
  // Hotfix calendar #2: nascondi annullati dalla griglia mese di default.
  // Toggle in toolbar "Mostra annullati". Preferenza persistita in
  // localStorage (per utente, non per org).
  const [showCancelled, setShowCancelled] = useState(() => {
    try { return localStorage.getItem('manutech_calendar_show_cancelled') === 'true' }
    catch { return false }
  })
  // Override effimero per arrivo da link "vedi su calendario" su intervento
  // annullato: non vogliamo persistere la preference dell'utente se è arrivato
  // tramite navigazione one-shot. null = nessun override, usa showCancelled.
  const [showCancelledOverride, setShowCancelledOverride] = useState(null)
  const effectiveShowCancelled = showCancelledOverride ?? showCancelled
  useEffect(() => {
    try { localStorage.setItem('manutech_calendar_show_cancelled', String(showCancelled)) }
    catch { /* localStorage non disponibile (Safari private mode etc.): swallow */ }
  }, [showCancelled])

  // Highlight in arrivo dalla card di un report: si attiva solo per il primo
  // mount e si resetta quando l'utente cambia mese / chiude la sidebar / clicca
  // un altro intervento. Non persistito.
  const [arrivedHighlightId, setArrivedHighlightId] = useState(
    initialHighlightInterventionId || null
  )

  // Hydration una sola volta al mount con i parametri di arrivo.
  // Non riapplica se i prop cambiano (l'utente naviga internamente al calendar
  // dopo essere arrivato — non deve essere riportato al giorno iniziale).
  const didHydrateRef = useRef(false)
  useEffect(() => {
    if (didHydrateRef.current) return
    didHydrateRef.current = true
    if (forceShowCancelledOnce) setShowCancelledOverride(true)
    if (initialOpenDay) setSidebar({ mode: 'day', date: initialOpenDay })
  }, [forceShowCancelledOnce, initialOpenDay])

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

  // Hotfix calendar #2: filtro griglia mese. Toggle "Mostra annullati" OFF
  // (default) → escludi pillole con status='annullato'. Lo storico annullati
  // resta accessibile via DayContextPanel (cliccando giorno) + via activity
  // log del report. Il filtro NON si applica a DayContextPanel/Detail che
  // sono accessi espliciti.
  const visibleInterventions = useMemo(() => {
    if (effectiveShowCancelled) return interventions
    return (interventions || []).filter(i => i.status !== 'annullato')
  }, [interventions, effectiveShowCancelled])
  const hiddenCancelledCount = useMemo(() => {
    if (effectiveShowCancelled) return 0
    return (interventions || []).filter(i => i.status === 'annullato').length
  }, [interventions, effectiveShowCancelled])

  // ── Navigazione mese ──
  // Cambio mese azzera l'highlight effimero in arrivo (l'utente è "andato altrove"
  // rispetto al punto di arrivo).
  const goPrev = () => {
    setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    setArrivedHighlightId(null)
  }
  const goNext = () => {
    setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    setArrivedHighlightId(null)
  }
  const goToday = () => {
    setCurrentMonth(new Date())
    setArrivedHighlightId(null)
  }

  const handleView = (v) => {
    if (v.enabled) setView(v.id)
    else toast.info(`Vista "${v.label}" disponibile prossimamente`, { icon: '🛠️' })
  }

  // ── Sidebar transitions ──
  // Qualsiasi transizione di sidebar avviata dall'utente azzera l'highlight in
  // arrivo: significa che l'utente sta già interagendo con il calendario.
  // Eccezione: openDay viene chiamato anche dall'hydration con la cella di
  // arrivo, in quel caso vogliamo mantenere l'highlight. La distinzione è
  // possibile perché in hydration usiamo setSidebar direttamente, non openDay.
  const closeSidebar = () => {
    setSidebar({ mode: 'hidden' })
    setArrivedHighlightId(null)
  }
  const openDetail = (interventionId) => {
    setSidebar({ mode: 'detail', interventionId })
    setArrivedHighlightId(null)
  }
  const openDay = (date) => {
    setSidebar({ mode: 'day', date })
    setArrivedHighlightId(null)
  }
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

  // Highlight della griglia: in modalità Detail mostra l'intervento attivo;
  // in modalità Day, se siamo appena arrivati da un link "vedi su calendario",
  // evidenzia la pillola target finché l'utente non interagisce.
  const highlightedInterventionId =
    sidebar.mode === 'detail' ? sidebar.interventionId :
    sidebar.mode === 'day' ? arrivedHighlightId :
    null

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

        {/* Toggle "Mostra annullati" (hotfix calendar #2). OFF default,
            persistito in localStorage. Mostra anche un piccolo badge col
            numero degli annullati nascosti, così l'admin sa che esistono.
            Se è attivo un override effimero (arrivo da link annullato), il
            click resetta l'override e cambia la preference utente in modo
            esplicito. */}
        <button
          onClick={() => {
            setShowCancelledOverride(null)
            setShowCancelled(v => !v)
          }}
          className="press-scale"
          title={effectiveShowCancelled
            ? 'Click per nascondere gli interventi annullati dalla griglia mese'
            : 'Click per mostrare gli interventi annullati nella griglia mese'}
          style={{
            padding: '7px 12px', borderRadius: 8,
            background: effectiveShowCancelled ? 'rgba(245,158,11,0.15)' : 'var(--color-surface-2)',
            border: `1px solid ${effectiveShowCancelled ? 'rgba(245,158,11,0.40)' : 'var(--color-border)'}`,
            color: effectiveShowCancelled ? '#f59e0b' : 'var(--color-text-secondary)',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          {effectiveShowCancelled ? <Eye size={14} /> : <EyeOff size={14} />}
          {effectiveShowCancelled ? 'Mostra annullati' : 'Annullati nascosti'}
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
            interventions={loading ? [] : visibleInterventions}
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
                onOpenReport={handleOpenReport}
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

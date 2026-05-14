import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import InterventionForm from '../interventions/InterventionForm'

/**
 * InterventionRequestModal — shell fullscreen mobile/desktop per pianificare
 * un intervento da `ReportDetail` (chat panel) o dalla sezione admin
 * `InterventionsForReport`.
 *
 * Da Sprint 1a-bis il modal è SOLO una shell. Le sue responsabilità:
 *   - Chrome del modal (header con back, subtitle col titolo del report)
 *   - Pre-carica users + supplier_profiles + counters per i picker enriched
 *   - Default smart: se user.role === 'admin' → supervised_by = user
 *   - Post-submit: db.createIntervention + addComment di tracking nella chat
 *
 * La logica del form (campi, validazione, upload foto, chip date, picker)
 * vive in `InterventionForm.jsx`. Il SidePanel calendario admin usa la stessa
 * shell architecturale ma renderizza il form nella sidebar destra.
 */
export default function InterventionRequestModal({ report, user, onClose, onApplied }) {
  const toast = useToast()
  const haptic = useHaptic()
  const [submitting, setSubmitting] = useState(false)
  const [users, setUsers] = useState([])
  const [supplierProfiles, setSupplierProfiles] = useState([])
  const [userCounters, setUserCounters] = useState({ active: {}, completedOnMachine: {} })
  const [loadingUsers, setLoadingUsers] = useState(true)

  // Carica utenti + supplier_profiles + counters per i picker enriched.
  // Pattern fire-and-forget al mount; gli errori non bloccano l'apertura
  // del modal (il form mostra "Caricamento utenti…" finché arrivano).
  useEffect(() => {
    let alive = true
    Promise.all([
      db.getUsers().catch(() => []),
      db.getSupplierProfiles?.().catch(() => []) ?? Promise.resolve([]),
      db.getUserPickerCounters({ machineId: report?.machine_id || null }).catch(() => ({ active: {}, completedOnMachine: {} })),
    ]).then(([u, p, c]) => {
      if (!alive) return
      setUsers(u || [])
      setSupplierProfiles(p || [])
      setUserCounters(c || { active: {}, completedOnMachine: {} })
    }).finally(() => {
      if (alive) setLoadingUsers(false)
    })
    return () => { alive = false }
  }, [report?.machine_id])

  const handleSubmit = async (payload, formContext, linkedReports) => {
    if (submitting) return
    setSubmitting(true)
    try {
      // Sprint 1c: createInterventionWithReports è la nuova API. Il form
      // gestisce internamente i link (almeno il report di origine via
      // context.report). Se per qualche ragione la lista è vuota, fallback
      // a singolo link sul report di apertura modal.
      const links = (linkedReports && linkedReports.length > 0)
        ? linkedReports
        : [{ report_id: report.id, is_origin: true, resolves_report: true }]

      await db.createInterventionWithReports({
        ...payload,
        origin: 'report',
        machine_id: payload.machine_id ?? report.machine_id ?? null,
        machine_name: payload.machine_name ?? report.machine ?? null,
        created_by: user.id,
        created_by_name: user.name,
      }, links)

      // Il comment "🔧 Intervento pianificato per DD/MM/YYYY — title — urgenza: X"
      // in chat report è ora gestito automaticamente dal DB layer
      // (db.createInterventionWithReports → postPlannedCommentToResolvingLinks).
      // Niente db.addComment qui: il messaggio dal DB layer copre TUTTI i path
      // (modal report, SidePanel calendario, reschedule).
      // formContext (urgency/specialty) resta argomento del callback per
      // compatibilità con la firma del form (potrebbe servire ad altri usi).
      void formContext

      toast.success('Intervento pianificato')
      haptic.success?.()
      onApplied?.()
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'riprova'))
      setSubmitting(false)
    }
  }

  // Default smart per supervised_by: l'admin che apre il form è probabilmente
  // chi seguirà la pianificazione. Per altri ruoli (tecnico, operatore), il
  // picker resta vuoto e l'utente sceglie esplicitamente se vuole assegnarlo.
  const formDefaults = {
    origin: 'report',
    machine_id: report.machine_id || null,
    machine_name: report.machine || null,
    location: report.machine || '',
    ...(user?.role === 'admin' ? {
      supervised_by: user.id,
      supervised_by_name: user.name,
    } : {}),
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 14px', borderBottom: '1px solid var(--color-border)',
      }}>
        <button onClick={onClose} className="press-scale" aria-label="Chiudi"
          style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 4 }}>
          <ChevronLeft size={24} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            Pianifica intervento
          </p>
          <p style={{
            fontSize: 11, margin: 0, color: 'var(--color-text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {report.title}
          </p>
        </div>
      </div>

      <InterventionForm
        defaults={formDefaults}
        context={{ report }}
        users={users}
        supplierProfiles={supplierProfiles}
        userCounters={userCounters}
        loadingUsers={loadingUsers}
        submitting={submitting}
        submitButtonLabel="Pianifica intervento"
        onSubmit={handleSubmit}
      />
    </div>
  )
}

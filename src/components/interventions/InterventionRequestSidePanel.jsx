import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { toDatetimeLocalString } from '../../lib/interventions'
import { useInterventionReports } from '../../hooks/useInterventionReports'
import InterventionForm from './InterventionForm'
import LinkedReportsSection from './LinkedReportsSection'

// Sprint 1c (post-review #3): in mode 'reschedule' la sezione "Segnalazioni
// associate" è LIVE (non read-only). Inline sopra il form via componente
// interno LinkedReportsLive: ogni modifica salva subito via hook
// useInterventionReports (stesso pattern del DetailPanel). Il form interno
// gestisce link solo in mode create; in reschedule li nasconde con
// hideLinkedReportsSection=true.

/**
 * InterventionRequestSidePanel — shell del form intervento per la SIDEBAR
 * DESTRA del calendario admin.
 *
 * Principio inviolabile Sprint 1a-bis: NIENTE modal sopra il calendario.
 * Il calendario centrale resta visibile mentre l'admin compila il form a destra.
 *
 * Due modalità (mode prop):
 *   - 'create' (default): crea un nuovo intervento.
 *     Sub-casi:
 *       a) prefillDate valorizzato → CTA "Nuovo per [data]" da DayContextPanel
 *          (origin='manuale', scheduled_start_at = date + 09:00)
 *       b) baseIntervention valorizzato → CTA "+ Abbina" da DayContextPanel
 *          (copia assigned_to/supervised_by/machine/start, hint "Copiato da INT-XXX")
 *   - 'reschedule': riprogramma un intervento esistente.
 *     existingIntervention valorizzato. Form pre-popolato con i suoi valori,
 *     l'utente cambia le date (chips A1). Submit → db.updateIntervention.
 *
 * Props
 *   mode                 'create' | 'reschedule'  (default 'create')
 *   user                 current user (per default supervised_by se admin)
 *   prefillDate          Date | null — giorno preselezionato (modo 'create' sub-a)
 *   baseIntervention     object | null — intervento base (modo 'create' sub-b)
 *   existingIntervention object | null — intervento da riprogrammare (mode='reschedule')
 *   onClose()            chiusura sidebar
 *   onCreated(int)       callback con l'intervento creato (mode='create')
 *   onUpdated(id)        callback dopo update (mode='reschedule')
 */
export default function InterventionRequestSidePanel({
  mode = 'create',
  user,
  prefillDate = null,
  baseIntervention = null,
  existingIntervention = null,
  onClose,
  onCreated,
  onUpdated,
}) {
  const isReschedule = mode === 'reschedule' && existingIntervention
  const toast = useToast()
  const haptic = useHaptic()
  const [submitting, setSubmitting] = useState(false)
  const [users, setUsers] = useState([])
  const [supplierProfiles, setSupplierProfiles] = useState([])
  const [userCounters, setUserCounters] = useState({ active: {}, completedOnMachine: {} })
  const [loadingUsers, setLoadingUsers] = useState(true)

  // Carica utenti + supplier_profiles + counters una volta al mount.
  // machineId per i counter di "interventi su questa macchina" è:
  //   - dalla baseIntervention se "+ Abbina"
  //   - dall'existingIntervention se reschedule
  //   - altrimenti null (no enrichment per macchina)
  const machineIdForCounters = baseIntervention?.machine_id
    || existingIntervention?.machine_id
    || null
  useEffect(() => {
    let alive = true
    Promise.all([
      db.getUsers().catch(() => []),
      db.getSupplierProfiles?.().catch(() => []) ?? Promise.resolve([]),
      db.getUserPickerCounters({ machineId: machineIdForCounters }).catch(() => ({ active: {}, completedOnMachine: {} })),
    ]).then(([u, p, c]) => {
      if (!alive) return
      setUsers(u || [])
      setSupplierProfiles(p || [])
      setUserCounters(c || { active: {}, completedOnMachine: {} })
    }).finally(() => {
      if (alive) setLoadingUsers(false)
    })
    return () => { alive = false }
  }, [machineIdForCounters])

  // Sprint 1c post-review: il caricamento dei link in reschedule mode è
  // gestito dal componente inline LinkedReportsLive (sotto) tramite hook
  // useInterventionReports. NIENTE caricamento qui.

  // Costruisce i defaults del form a partire da existingIntervention /
  // prefillDate / baseIntervention.
  // Priorità:
  //   0. existingIntervention (reschedule) — copia TUTTO il record corrente
  //   1. baseIntervention (Abbina) sovrascrive tutto
  //   2. prefillDate (Nuovo per data) imposta scheduled_start_at
  //   3. user admin → supervised_by = user
  const formDefaults = (() => {
    const base = { origin: 'manuale' }

    if (isReschedule) {
      const e = existingIntervention
      return {
        origin: e.origin || 'manuale',
        type: e.type,
        severity: e.severity,
        title: e.title,
        description: e.description,
        machine_id: e.machine_id,
        machine_name: e.machine_name,
        report_id: e.report_id,
        maintenance_plan_id: e.maintenance_plan_id,
        location: e.location || '',
        assigned_to: e.assigned_to,
        assigned_to_name: e.assigned_to_name,
        assigned_to_role: e.assigned_to_role,
        supervised_by: e.supervised_by,
        supervised_by_name: e.supervised_by_name,
        scheduled_start_at: e.scheduled_start_at,
        scheduled_end_at: e.scheduled_end_at,
        estimated_duration_min: e.estimated_duration_min,
        media: e.media || [],
        extra_data: e.extra_data || {},
        urgency: e.extra_data?.urgency,
      }
    }

    if (baseIntervention) {
      const b = baseIntervention
      const inheritedHint = b.id ? `INT-${String(b.id).slice(0, 6)}` : undefined
      return {
        ...base,
        machine_id: b.machine_id || null,
        machine_name: b.machine_name || null,
        location: b.location || '',
        assigned_to: b.assigned_to || null,
        assigned_to_name: b.assigned_to_name || null,
        assigned_to_role: b.assigned_to_role || null,
        supervised_by: b.supervised_by || (user?.role === 'admin' ? user.id : null),
        supervised_by_name: b.supervised_by_name || (user?.role === 'admin' ? user.name : null),
        supervised_by_inherited_from: b.supervised_by ? inheritedHint : undefined,
        scheduled_start_at: b.scheduled_start_at || null,
      }
    }

    if (prefillDate) {
      const d = prefillDate instanceof Date ? new Date(prefillDate) : new Date(prefillDate)
      d.setHours(9, 0, 0, 0)
      return {
        ...base,
        scheduled_start_at: d.toISOString(),
        ...(user?.role === 'admin' ? {
          supervised_by: user.id,
          supervised_by_name: user.name,
        } : {}),
      }
    }

    return {
      ...base,
      ...(user?.role === 'admin' ? {
        supervised_by: user.id,
        supervised_by_name: user.name,
      } : {}),
    }
  })()

  const subtitle = (() => {
    if (isReschedule) return existingIntervention.title || 'Intervento'
    if (baseIntervention) return `Abbinato a ${baseIntervention.title || 'intervento'}`
    if (prefillDate) {
      const d = prefillDate instanceof Date ? prefillDate : new Date(prefillDate)
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      return `Per giorno ${dd}/${mm}/${yyyy}`
    }
    return 'Nuovo intervento'
  })()

  const handleSubmit = async (payload, _formContext, linkedReports) => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (isReschedule) {
        // Reschedule: aggiorniamo solo i campi base, NON tocchiamo i link
        // (gestiti dal DetailPanel sezione "Segnalazioni associate")
        await db.updateIntervention(existingIntervention.id, {
          ...payload,
          updated_by_user_id: user.id,
          updated_by_user_name: user.name,
        })
        toast.success('Intervento riprogrammato')
        haptic.success?.()
        onUpdated?.(existingIntervention.id)
      } else {
        // Create: API principale Sprint 1c con link N→M
        const intervention = await db.createInterventionWithReports({
          ...payload,
          created_by: user.id,
          created_by_name: user.name,
        }, linkedReports || [])
        toast.success('Intervento creato')
        haptic.success?.()
        onCreated?.(intervention)
      }
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'riprova'))
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-surface-1)',
    }}>
      {/* Header sidebar (no fullscreen, no back arrow) */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: isReschedule ? '#f59e0b' : 'var(--color-primary)',
            margin: 0,
          }}>
            {isReschedule ? 'Riprogrammazione' : 'Nuovo intervento'}
          </p>
          <p style={{
            fontSize: 14, fontWeight: 600, color: 'var(--color-text)',
            margin: '2px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{subtitle}</p>
          {/* Orario pre-impostato per prefillDate (solo create modo data) */}
          {prefillDate && !baseIntervention && !isReschedule && (
            <p style={{
              fontSize: 11, color: 'var(--color-text-secondary)',
              margin: '2px 0 0', fontFamily: '"JetBrains Mono", monospace',
            }}>
              {toDatetimeLocalString(formDefaults.scheduled_start_at)}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Chiudi" className="press-scale"
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: 'none',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
          <X size={16} />
        </button>
      </div>

      {/* Banner reschedule */}
      {isReschedule && (
        <div style={{
          flexShrink: 0,
          padding: '8px 14px',
          background: 'rgba(245,158,11,0.08)',
          borderBottom: '1px solid rgba(245,158,11,0.25)',
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.4,
        }}>
          Modifica data/ora di inizio o fine. Le altre modifiche al form
          vengono salvate insieme alla riprogrammazione. Le segnalazioni
          associate (sotto) si salvano immediatamente.
        </div>
      )}

      {/* Form (+ sezione link live in reschedule) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {isReschedule && (
          <div style={{ padding: '12px 16px 0' }}>
            <LinkedReportsLive
              interventionId={existingIntervention.id}
              machineId={existingIntervention.machine_id}
            />
          </div>
        )}
        <InterventionForm
          defaults={formDefaults}
          context={{}}
          users={users}
          supplierProfiles={supplierProfiles}
          userCounters={userCounters}
          loadingUsers={loadingUsers}
          submitting={submitting}
          submitButtonLabel={isReschedule ? 'Salva modifiche' : 'Crea intervento'}
          onSubmit={handleSubmit}
          onCancel={onClose}
          initialLinks={[]}
          linksReadOnly={false}
          hideLinkedReportsSection={isReschedule}
        />
      </div>
    </div>
  )
}

/**
 * LinkedReportsLive — sezione "Segnalazioni associate" inline per mode
 * reschedule. Connesso a useInterventionReports hook: ogni add/remove/toggle
 * salva immediatamente in DB (no raccolta al submit). Stesso pattern del
 * DetailPanel.
 */
function LinkedReportsLive({ interventionId, machineId }) {
  const linksHook = useInterventionReports(interventionId)

  const linksValue = useMemo(() => (linksHook.reports || []).map(r => ({
    report_id: r.id,
    is_origin: !!r.link_is_origin,
    resolves_report: !!r.link_resolves_report,
  })), [linksHook.reports])

  const handleLinksChange = async (newValue) => {
    const oldMap = new Map(linksValue.map(l => [l.report_id, l]))
    const newMap = new Map(newValue.map(l => [l.report_id, l]))
    for (const link of newValue) {
      const old = oldMap.get(link.report_id)
      if (!old) {
        await linksHook.addLink({
          reportId: link.report_id,
          isOrigin: !!link.is_origin,
          resolvesReport: !!link.resolves_report,
        })
      } else if (old.resolves_report !== link.resolves_report) {
        await linksHook.toggleResolves(link.report_id, link.resolves_report)
      }
    }
    for (const old of linksValue) {
      if (!newMap.has(old.report_id) && !old.is_origin) {
        await linksHook.removeLink(old.report_id)
      }
    }
  }

  return (
    <LinkedReportsSection
      value={linksValue}
      onChange={handleLinksChange}
      currentMachineId={machineId}
      currentInterventionId={interventionId}
    />
  )
}

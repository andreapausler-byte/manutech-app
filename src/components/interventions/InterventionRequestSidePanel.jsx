import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { toDatetimeLocalString } from '../../lib/interventions'
import InterventionForm from './InterventionForm'

/**
 * InterventionRequestSidePanel — shell del form intervento per la SIDEBAR
 * DESTRA del calendario admin (modalità "create" dello state machine sidebar).
 *
 * Principio inviolabile Sprint 1a-bis: NIENTE modal sopra il calendario.
 * Il calendario centrale resta visibile mentre l'admin compila il form a destra.
 *
 * Casi d'uso:
 *   1. CTA "Nuovo intervento per [data]" da DayContextPanel
 *      → prefillDate valorizzato (origin='manuale', start_at = date + 09:00)
 *   2. CTA "+ Abbina" su una card di DayContextPanel
 *      → baseIntervention valorizzato: copia assigned_to + supervised_by +
 *        machine_id + scheduled_start_at, con hint "Copiato da INT-XXX" sui picker
 *
 * Props
 *   user             current user (per default supervised_by se admin)
 *   prefillDate      Date | null — giorno preselezionato (modo "Nuovo per data")
 *   baseIntervention object | null — intervento base per modo "+ Abbina"
 *   onClose()        chiusura sidebar
 *   onCreated(int)   callback con l'intervento creato (la AdminCalendar
 *                    transita poi in modalità detail su quell'id)
 */
export default function InterventionRequestSidePanel({
  user,
  prefillDate = null,
  baseIntervention = null,
  onClose,
  onCreated,
}) {
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
  //   - altrimenti null (no enrichment per macchina)
  const machineIdForCounters = baseIntervention?.machine_id || null
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

  // Costruisce i defaults del form a partire da prefillDate / baseIntervention.
  // Priorità:
  //   1. baseIntervention (Abbina) sovrascrive tutto
  //   2. prefillDate (Nuovo per data) imposta scheduled_start_at
  //   3. user admin → supervised_by = user
  const formDefaults = (() => {
    const base = { origin: 'manuale' }

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

  const handleSubmit = async (payload) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const intervention = await db.createIntervention({
        ...payload,
        created_by: user.id,
        created_by_name: user.name,
      })
      toast.success('Intervento creato')
      haptic.success?.()
      onCreated?.(intervention)
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
            textTransform: 'uppercase', color: 'var(--color-primary)',
            margin: 0,
          }}>Nuovo intervento</p>
          <p style={{
            fontSize: 14, fontWeight: 600, color: 'var(--color-text)',
            margin: '2px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{subtitle}</p>
          {/* Mostra orario pre-impostato per prefillDate */}
          {prefillDate && !baseIntervention && (
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

      {/* Form */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <InterventionForm
          defaults={formDefaults}
          context={{}}
          users={users}
          supplierProfiles={supplierProfiles}
          userCounters={userCounters}
          loadingUsers={loadingUsers}
          submitting={submitting}
          submitButtonLabel="Crea intervento"
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}

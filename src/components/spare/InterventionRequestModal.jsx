import { useState } from 'react'
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
 * Da Sprint 1a-bis il modal è SOLO una shell: la logica del form vive in
 * `InterventionForm.jsx`. Il modal aggiunge:
 *   - chrome del modal (header con back, subtitle col titolo del report)
 *   - business logic post-submit: db.createIntervention + addComment di
 *     tracking nella chat del report + toast/haptic + onApplied callback.
 *
 * Per il calendario admin esiste invece `InterventionRequestSidePanel` che
 * usa lo stesso `InterventionForm` ma renderizzato in sidebar (Sprint 1a-bis,
 * principio: no modal sopra il calendario).
 */
export default function InterventionRequestModal({ report, user, onClose, onApplied }) {
  const toast = useToast()
  const haptic = useHaptic()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (payload, formContext) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const intervention = await db.createIntervention({
        ...payload,
        report_id: report.id,
        origin: 'report',
        machine_id: payload.machine_id ?? report.machine_id ?? null,
        machine_name: payload.machine_name ?? report.machine ?? null,
        created_by: user.id,
        created_by_name: user.name,
      })

      // Comment di tracking nella chat del report: la pianificazione resta
      // invisibile dal solo modal, questo notifica la chat che è stato fatto.
      const titleStr = payload.title
      const specialty = formContext?.specialty || null
      const urgency = formContext?.urgency || null
      const commentText = `🛠️ Intervento pianificato: ${titleStr}${specialty ? ` · ${specialty}` : ''}${urgency ? ` — urgenza: ${urgency}` : ''}`
      await db.addComment(report.id, {
        text: commentText,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        kind: 'spare_request',
        extra_data: {
          intervention_id: intervention?.id || null,
          kind: 'intervento',
          articolo: titleStr,
          specialty,
          urgenza: urgency,
          note: payload.description || null,
          scheduled_at: payload.scheduled_start_at,
        },
        media: payload.media?.length > 0 ? payload.media : null,
      })

      toast.success('Intervento pianificato')
      haptic.success?.()
      onApplied?.()
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'riprova'))
      setSubmitting(false)
    }
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
        defaults={{
          origin: 'report',
          machine_id: report.machine_id || null,
          machine_name: report.machine || null,
          location: report.machine || '',
        }}
        context={{ report }}
        submitting={submitting}
        submitButtonLabel="Pianifica intervento"
        onSubmit={handleSubmit}
      />
    </div>
  )
}

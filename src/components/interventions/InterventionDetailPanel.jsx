// Pannello destro del calendario admin: dettaglio dell'intervento selezionato.
// Carica via db.getIntervention(id), mostra info principali, azioni di stato.
// Sprint 1c: include sezione "Segnalazioni associate (N)" via LinkedReportsSection.

import { useEffect, useMemo, useState } from 'react'
import { X, Calendar, MapPin, User as UserIcon, Users as UsersIcon, Wrench, FileText, Play, Check, AlertOctagon, CalendarClock, Link2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatScheduledShort, getDurationMinutes } from '../../lib/interventions'
import { useInterventionMutations } from '../../hooks/useInterventionMutations'
import { useInterventionReports } from '../../hooks/useInterventionReports'
import InterventionBadge from './InterventionBadge'
import LinkedReportsSection from './LinkedReportsSection'

// Nota Sprint 1c: il prop `onOpenReport` (Sprint 1a/1b) NON è più consumato
// internamente: la sezione "Segnalazioni associate" mostra già i link via
// LinkedReportsSection. I caller possono continuare a passarlo: viene
// ignorato (React non protesta sui props extra). Futura UX potrà aggiungere
// un "Apri →" sulle card della section.
export default function InterventionDetailPanel({ interventionId, onClose, onReschedule, onMatch }) {
  const [intervention, setIntervention] = useState(null)
  const [loading, setLoading] = useState(true)
  // Sprint 1c follow-up: participants. null = loading, [] = nessuno, [...] = lista.
  // Distinto da `loading` (che gate l'intero pannello) perché la fetch è
  // indipendente e indipendente da getIntervention.
  const [participants, setParticipants] = useState(null)
  const mutations = useInterventionMutations()
  const linksHook = useInterventionReports(interventionId)

  // Mappa reports del hook nel formato {report_id, is_origin, resolves_report}
  // richiesto da LinkedReportsSection.
  const linksValue = useMemo(() => (linksHook.reports || []).map(r => ({
    report_id: r.id,
    is_origin: !!r.link_is_origin,
    resolves_report: !!r.link_resolves_report,
  })), [linksHook.reports])

  // Diff handler: confronta nuova lista con vecchia, fa add/remove/toggle.
  const handleLinksChange = async (newValue) => {
    const oldMap = new Map(linksValue.map(l => [l.report_id, l]))
    const newMap = new Map(newValue.map(l => [l.report_id, l]))
    // Add e toggle
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
    // Remove
    for (const old of linksValue) {
      if (!newMap.has(old.report_id) && !old.is_origin) {
        await linksHook.removeLink(old.report_id)
      }
    }
  }

  useEffect(() => {
    let alive = true
    if (!interventionId) {
      setIntervention(null)
      setLoading(false)
      return
    }
    setLoading(true)
    db.getIntervention(interventionId)
      .then(d => { if (alive) setIntervention(d) })
      .catch(e => console.warn('[InterventionDetailPanel] load failed:', e?.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [interventionId])

  // Sprint 1c follow-up: fetch participants. Indipendente da getIntervention
  // (RLS già filtra per org_id). On error degradiamo a "nessuno" — la UI
  // semplicemente nasconde la sezione invece di mostrare un errore inline.
  useEffect(() => {
    let alive = true
    if (!interventionId) {
      setParticipants([])
      return
    }
    setParticipants(null)
    db.getInterventionParticipants(interventionId)
      .then(rows => { if (alive) setParticipants(rows || []) })
      .catch(e => {
        console.warn('[InterventionDetailPanel] getInterventionParticipants failed:', e?.message)
        if (alive) setParticipants([])
      })
    return () => { alive = false }
  }, [interventionId])

  if (loading) {
    return (
      <PanelShell onClose={onClose} title="Caricamento…">
        <p style={{ color: 'var(--color-text-secondary)', padding: 16 }}>…</p>
      </PanelShell>
    )
  }

  if (!intervention) {
    return (
      <PanelShell onClose={onClose} title="Intervento non trovato">
        <p style={{ color: 'var(--color-text-secondary)', padding: 16 }}>
          Seleziona un intervento dal calendario.
        </p>
      </PanelShell>
    )
  }

  const duration = getDurationMinutes(intervention)
  const canStart = intervention.status === 'pianificato' || intervention.status === 'confermato'
  const canComplete = intervention.status === 'in_corso'
  const canCancel = !['completato', 'annullato'].includes(intervention.status)
  const canReschedule = !['completato', 'annullato'].includes(intervention.status) && !!onReschedule
  const canMatch = !['annullato'].includes(intervention.status) && !!onMatch

  const handleStart = async () => {
    try {
      const updated = await mutations.start(intervention.id)
      setIntervention(updated)
    } catch { /* toast già mostrato dal mutation hook */ }
  }
  const handleComplete = async () => {
    try {
      const updated = await mutations.complete(intervention.id, {})
      setIntervention(updated)
    } catch { /* idem */ }
  }
  const handleCancel = async () => {
    const reason = prompt('Motivo annullamento (opzionale)') || null
    try {
      const updated = await mutations.cancel(intervention.id, reason)
      setIntervention(updated)
    } catch { /* idem */ }
  }

  return (
    <PanelShell onClose={onClose} title="Intervento">
      <div style={{ padding: 16, overflowY: 'auto' }}>
        <h2 style={{
          fontSize: 18, fontWeight: 700, color: 'var(--color-text)',
          margin: '0 0 10px', lineHeight: 1.3,
        }}>
          {intervention.title}
        </h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          <InterventionBadge field="status" value={intervention.status} size="md" />
          <InterventionBadge field="type" value={intervention.type} size="md" showIcon={false} />
          <InterventionBadge field="severity" value={intervention.severity} size="md" showIcon={false} />
        </div>

        <InfoRow icon={<Calendar size={14} />} label="Quando">
          {formatScheduledShort(intervention.scheduled_start_at)}
          {duration && (
            <span style={{ color: 'var(--color-text-secondary)' }}> · {duration} min</span>
          )}
        </InfoRow>

        {intervention.assigned_to_name && (
          <InfoRow icon={<UserIcon size={14} />} label="Assegnato a">
            {intervention.assigned_to_name}
            {intervention.assigned_to_role && (
              <span style={{ color: 'var(--color-text-secondary)' }}> ({intervention.assigned_to_role})</span>
            )}
          </InfoRow>
        )}

        {/* Sprint 1c follow-up — altri utenti coinvolti (N→M). Skeleton durante
            la fetch; sezione interamente nascosta se length=0 (no placeholder
            "Nessuno"). user_name_snapshot e' denormalizzato in DB, no JOIN. */}
        {participants === null && (
          <InfoRow icon={<UsersIcon size={14} />} label="Coinvolti">
            <span style={{
              display: 'inline-block', width: 140, height: 12,
              borderRadius: 4, background: 'var(--color-surface-2)',
              verticalAlign: 'middle',
            }} />
          </InfoRow>
        )}
        {Array.isArray(participants) && participants.length > 0 && (
          <InfoRow icon={<UsersIcon size={14} />} label="Coinvolti">
            {participants.map(p => p.user_name_snapshot || 'Sconosciuto').join(', ')}
          </InfoRow>
        )}

        {intervention.machine_name && (
          <InfoRow icon={<Wrench size={14} />} label="Macchinario">
            {intervention.machine_name}
          </InfoRow>
        )}

        {intervention.location && (
          <InfoRow icon={<MapPin size={14} />} label="Dove">
            {intervention.location}
          </InfoRow>
        )}

        {intervention.description && (
          <div style={{ marginTop: 10 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
              textTransform: 'uppercase', color: 'var(--color-text-secondary)',
              margin: '0 0 4px',
            }}>Descrizione</p>
            <p style={{
              fontSize: 13, color: 'var(--color-text)', margin: 0,
              lineHeight: 1.4, whiteSpace: 'pre-wrap',
            }}>{intervention.description}</p>
          </div>
        )}

        {intervention.planning_notes && (
          <div style={{ marginTop: 10 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
              textTransform: 'uppercase', color: 'var(--color-text-secondary)',
              margin: '0 0 4px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}><FileText size={11} /> Note pianificazione</p>
            <p style={{
              fontSize: 12, color: 'var(--color-text)', margin: 0,
              lineHeight: 1.4, whiteSpace: 'pre-wrap',
              background: 'var(--color-surface-2)', padding: 8, borderRadius: 8,
            }}>{intervention.planning_notes}</p>
          </div>
        )}

        {/* Sprint 1c: sezione "Segnalazioni associate" — UI uniforme N=0/1/N>1.
            La gestione (add/remove/toggle resolves_report) avviene via hook
            useInterventionReports + diff in handleLinksChange. */}
        <div style={{ marginTop: 16 }}>
          <LinkedReportsSection
            value={linksValue}
            onChange={handleLinksChange}
            currentMachineId={intervention.machine_id}
            currentInterventionId={intervention.id}
          />
        </div>

        {/* Azioni */}
        <div style={{
          marginTop: 18, paddingTop: 14,
          borderTop: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {canStart && (
            <ActionButton onClick={handleStart} color="#06b6d4" icon={<Play size={14} />} disabled={mutations.loading}>
              Inizia intervento
            </ActionButton>
          )}
          {canComplete && (
            <ActionButton onClick={handleComplete} color="#22c55e" icon={<Check size={14} />} disabled={mutations.loading}>
              Completa intervento
            </ActionButton>
          )}
          {canMatch && (
            <ActionButton onClick={() => onMatch(intervention)} color="#7c6aff" variant="ghost" icon={<Link2 size={14} />} disabled={mutations.loading}>
              Abbina nuovo
            </ActionButton>
          )}
          {canReschedule && (
            <ActionButton onClick={() => onReschedule(intervention)} color="#f59e0b" variant="ghost" icon={<CalendarClock size={14} />} disabled={mutations.loading}>
              Modifica
            </ActionButton>
          )}
          {canCancel && (
            <ActionButton onClick={handleCancel} color="#ef4444" variant="ghost" icon={<AlertOctagon size={14} />} disabled={mutations.loading}>
              Annulla intervento
            </ActionButton>
          )}
        </div>
      </div>
    </PanelShell>
  )
}

function PanelShell({ title, onClose, children }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-surface-1)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
          textTransform: 'uppercase', color: 'var(--color-text-secondary)',
          margin: 0,
        }}>{title}</p>
        <button onClick={onClose} aria-label="Chiudi pannello" className="press-scale"
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: 'none',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <span style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
          textTransform: 'uppercase', color: 'var(--color-text-secondary)',
          margin: '0 0 2px',
        }}>{label}</p>
        <p style={{ fontSize: 13, color: 'var(--color-text)', margin: 0 }}>{children}</p>
      </div>
    </div>
  )
}

function ActionButton({ children, color, icon, onClick, disabled, variant = 'solid' }) {
  const isSolid = variant === 'solid'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="press-scale"
      style={{
        padding: '10px 14px',
        background: isSolid ? color : 'transparent',
        border: isSolid ? 'none' : `1px solid ${color}55`,
        borderRadius: 10,
        color: isSolid ? '#fff' : color,
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: 6,
      }}
    >
      {icon} {children}
    </button>
  )
}

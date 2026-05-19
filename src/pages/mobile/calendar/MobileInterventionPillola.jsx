import { ArrowUpRight, User as UserIcon } from 'lucide-react'
import InterventionBadge from '../../../components/interventions/InterventionBadge'
import { isOverdue } from '../../../lib/interventions'

function formatTimeShort(scheduledAt) {
  if (!scheduledAt) return '--:--'
  const d = new Date(scheduledAt)
  const HH = String(d.getHours()).padStart(2, '0')
  const MM = String(d.getMinutes()).padStart(2, '0')
  return `${HH}:${MM}`
}

/**
 * Pillola compatta 56px tappabile per liste interventi mobile.
 *
 * Phase 1b-A: target glove-friendly (alto ≥56px). Riusa InterventionBadge per
 * lo stato. Bottone laterale "Apri report" appare solo se l'intervento ha
 * esattamente 1 link risolutivo (parità con desktop opt-A Sprint 1c-bis).
 *
 * Props
 *   intervention   record completo (con linked_reports opzionale)
 *   onClick()      tap sulla pillola (apre detail / sheet)
 *   onOpenReport(reportId)  scorciatoia al report (visibile solo se N=1)
 *   dim            stile de-enfatizzato (annullato/completato)
 *   highlighted    bordo evidenziato (es. arrivo da deep link)
 */
export default function MobileInterventionPillola({
  intervention,
  onClick,
  onOpenReport,
  dim = false,
  highlighted = false,
}) {
  if (!intervention) return null

  const overdue = isOverdue(intervention)
  const time = formatTimeShort(intervention.scheduled_start_at)

  const linked = Array.isArray(intervention.linked_reports) ? intervention.linked_reports : []
  const resolvingLinks = linked.filter(l => l.resolves_report !== false)
  const singleResolvingReportId =
    resolvingLinks.length === 1 ? resolvingLinks[0].report_id : null
  const showOpenReport = Boolean(singleResolvingReportId && onOpenReport)

  const borderColor = highlighted
    ? 'var(--color-primary)'
    : overdue && !dim
      ? 'rgba(239,68,68,0.5)'
      : 'var(--color-border)'

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
      <button
        onClick={onClick}
        className="press-scale"
        aria-label={`Intervento ${intervention.title} alle ${time}`}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 56,
          padding: '10px 12px',
          background: 'var(--color-surface-2)',
          border: `${highlighted ? 2 : 1}px solid ${borderColor}`,
          borderRadius: 14,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          opacity: dim ? 0.55 : 1,
        }}
      >
        <div style={{
          flexShrink: 0,
          fontSize: 14,
          fontWeight: 700,
          fontFamily: '"JetBrains Mono", monospace',
          color: overdue && !dim ? '#ef4444' : 'var(--color-text)',
          minWidth: 44,
        }}>
          {time}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textDecoration: dim ? 'line-through' : 'none',
            marginBottom: 4,
          }}>
            {intervention.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <InterventionBadge field="status" value={intervention.status} />
            {intervention.assigned_to_name && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, color: 'var(--color-text-secondary)',
              }}>
                <UserIcon size={10} /> {intervention.assigned_to_name}
              </span>
            )}
          </div>
        </div>
      </button>
      {showOpenReport && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpenReport(singleResolvingReportId) }}
          className="press-scale"
          title="Apri la segnalazione collegata"
          aria-label="Apri segnalazione collegata"
          style={{
            flexShrink: 0,
            width: 48, height: 56,
            background: 'rgba(16,185,129,0.14)',
            border: '1px solid rgba(16,185,129,0.35)',
            borderRadius: 14,
            color: '#10b981',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <ArrowUpRight size={18} />
        </button>
      )}
    </div>
  )
}

import { ArrowUpRight, User as UserIcon, Wrench, ShieldCheck, TrendingUp, Search, Paperclip } from 'lucide-react'
import { REPORT_TYPES, SEVERITY } from '../../../lib/constants'

const TYPE_META = {
  correttiva: { icon: Wrench, label: REPORT_TYPES.correttiva?.label || 'Correttiva', color: REPORT_TYPES.correttiva?.color || '#ef4444' },
  preventiva: { icon: ShieldCheck, label: REPORT_TYPES.preventiva?.label || 'Preventiva', color: REPORT_TYPES.preventiva?.color || '#7c6aff' },
  migliorativa: { icon: TrendingUp, label: REPORT_TYPES.migliorativa?.label || 'Migliorativa', color: REPORT_TYPES.migliorativa?.color || '#22c55e' },
  ispezione: { icon: Search, label: REPORT_TYPES.ispezione?.label || 'Ispezione', color: REPORT_TYPES.ispezione?.color || '#a855f7' },
}

// Mapping schema reale INTERVENTION_STATUSES (6 valori) → border-left.
// Bozza/pianificato/confermato = "in attesa" (grigio neutrale).
const STATUS_BORDER = {
  bozza: 'var(--color-text-muted)',
  pianificato: 'var(--color-text-muted)',
  confermato: 'var(--color-text-muted)',
  in_corso: '#06b6d4',
  completato: '#22c55e',
  annullato: '#ef4444',
}

function formatTimeShort(scheduledAt) {
  if (!scheduledAt) return '--:--'
  const d = new Date(scheduledAt)
  const HH = String(d.getHours()).padStart(2, '0')
  const MM = String(d.getMinutes()).padStart(2, '0')
  return `${HH}:${MM}`
}

/**
 * Pillola intervento mobile a 2 righe, glove-friendly (~80px).
 *
 * Fix UX 1b-A (post-smoke-test): la pillola adesso porta tipo + severità +
 * assegnatario + count linked report a colpo d'occhio. La pillola NON è un
 * tap-target (mobile non ha ancora InterventionDetail standalone — TODO Phase
 * 3): l'unico tap attivo è il side button "Apri report" verde, visibile solo
 * se l'intervento ha esattamente 1 link risolutivo (parità 1c-bis).
 *
 * Critica visual boost: dot pulsante + label "CRITICA" + ring rosso esterno +
 * sort priority (gestito dal chiamante).
 *
 * Annullato: border rosso + opacity ridotta + line-through sul titolo.
 *
 * Props
 *   intervention   record completo (con linked_reports opzionale)
 *   onOpenReport(reportId)  scorciatoia al report (visibile solo se N=1)
 *   highlighted    bordo evidenziato (es. arrivo da deep link)
 */
export default function MobileInterventionPillola({
  intervention,
  onOpenReport,
  highlighted = false,
}) {
  if (!intervention) return null

  const time = formatTimeShort(intervention.scheduled_start_at)
  const isCancelled = intervention.status === 'annullato'
  const isCritical = intervention.severity === 'critica'
  const typeMeta = TYPE_META[intervention.type] || null
  const sevMeta = SEVERITY[intervention.severity] || null
  const borderColor = STATUS_BORDER[intervention.status] || 'var(--color-text-muted)'

  const linked = Array.isArray(intervention.linked_reports) ? intervention.linked_reports : []
  const resolvingLinks = linked.filter(l => l.resolves_report !== false)
  const singleResolvingReportId =
    resolvingLinks.length === 1 ? resolvingLinks[0].report_id : null
  const showOpenReport = Boolean(singleResolvingReportId && onOpenReport)
  const linkedCount = linked.length

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <div
        role="group"
        aria-label={`Intervento ${intervention.title}, ${time}, severità ${intervention.severity || 'non specificata'}`}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '12px 14px',
          background: 'var(--color-surface-2)',
          border: `${highlighted ? 2 : 1}px solid ${highlighted ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderLeft: `4px solid ${borderColor}`,
          borderRadius: 14,
          opacity: isCancelled ? 0.55 : 1,
          boxShadow: isCritical
            ? '0 0 0 1px rgba(239,68,68,0.4), 0 0 18px rgba(239,68,68,0.15)'
            : undefined,
        }}
      >
        {/* Riga 1: orario + titolo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 18, fontWeight: 700,
            fontFamily: '"JetBrains Mono", monospace',
            color: 'var(--color-text)',
            lineHeight: 1,
            flexShrink: 0,
            minWidth: 56,
          }}>
            {time}
          </span>
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: 15, fontWeight: 600,
            color: 'var(--color-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textDecoration: isCancelled ? 'line-through' : 'none',
          }}>
            {intervention.title}
          </span>
          {isCritical && (
            <span style={{
              flexShrink: 0,
              fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
              color: '#fff',
              background: '#ef4444',
              padding: '2px 6px', borderRadius: 6,
              textTransform: 'uppercase',
            }}>
              Critica
            </span>
          )}
        </div>

        {/* Riga 2: tipo · dot severità · assegnatario · count linked */}
        <div style={{
          marginTop: 8,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          fontSize: 13,
        }}>
          {typeMeta && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: typeMeta.color,
              fontWeight: 700,
            }}>
              <typeMeta.icon size={14} /> {typeMeta.label}
            </span>
          )}

          {sevMeta && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}
              aria-label={`Severità ${sevMeta.label}`}
              title={`Severità: ${sevMeta.label}`}
            >
              <span style={{
                display: 'inline-block',
                width: 12, height: 12, borderRadius: 999,
                background: sevMeta.color,
                animation: isCritical ? 'pulseRing 1.6s ease-in-out infinite' : undefined,
              }} />
            </span>
          )}

          {intervention.assigned_to_name ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: '#d4d4d8',
              fontWeight: 500,
              maxWidth: 160,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <UserIcon size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {intervention.assigned_to_name}
              </span>
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: '#a1a1aa',
              fontStyle: 'italic',
            }}>
              <UserIcon size={13} /> Non assegnato
            </span>
          )}

          {linkedCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: '#d4d4d8',
              fontWeight: 600,
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              <Paperclip size={13} /> {linkedCount} report
            </span>
          )}
        </div>
      </div>

      {showOpenReport && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpenReport(singleResolvingReportId) }}
          className="press-scale"
          title="Apri la segnalazione collegata"
          aria-label="Apri segnalazione collegata"
          style={{
            flexShrink: 0,
            width: 48,
            minHeight: 56,
            alignSelf: 'stretch',
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

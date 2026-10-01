/**
 * ResolvedReportCard — una segnalazione conclusa, letta dal lato "come".
 *
 * Nell'archivio la domanda non è più "cosa non va" ma "com'è stato
 * risolto": la card porta in primo piano causa radice e azione correttiva,
 * poi ore, ricambi e chi ha chiuso. Gravità e chat, che contano finché il
 * ticket è aperto, qui escono di scena.
 *
 * Usata nella tab Archivio della lista segnalazioni e nelle "Concluse"
 * della scheda macchina: davanti alla macchina la domanda è la stessa.
 */

import { CheckCircle2, AlertTriangle, XCircle, Cog, Clock, Package, User, StickyNote } from 'lucide-react'
import { formatDateParts } from '../../lib/constants'
import { getClosure, closureOutcome, closedAtOf, CLOSURE_OUTCOMES } from '../../lib/closure'
import { TicketIdBadge } from '../ui'
import ComponentPill from '../machines/ComponentPill'

const OUTCOME_ICONS = {
  intervento: CheckCircle2,
  da_completare: AlertTriangle,
  senza: XCircle,
}

function ClosureLine({ label, text, missing }) {
  return (
    <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        color: 'var(--color-text-muted)', width: 50, flexShrink: 0, paddingTop: 2,
      }}>
        {label}
      </span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.35,
        color: missing ? 'var(--color-text-faint)' : 'var(--color-text)',
        fontStyle: missing ? 'italic' : 'normal',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {text}
      </span>
    </div>
  )
}

export default function ResolvedReportCard({ report, onSelect, showMachine = true }) {
  const closure = getClosure(report)
  const outcome = closureOutcome(report)
  const meta = CLOSURE_OUTCOMES[outcome]
  const OutcomeIcon = OUTCOME_ICONS[outcome]
  const { day, month } = formatDateParts(closedAtOf(report))
  const footer = [
    closure.hours != null && { icon: Clock, text: `${closure.hours}h` },
    closure.parts && { icon: Package, text: closure.parts },
    report.assigned_to_name && outcome !== 'senza' && { icon: User, text: report.assigned_to_name },
    closure.notes.length > 0 && { icon: StickyNote, text: `${closure.notes.length} ${closure.notes.length === 1 ? 'nota' : 'note'} dopo` },
  ].filter(Boolean)

  return (
    <button
      onClick={() => onSelect?.(report)}
      className="w-full text-left press-scale"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16, padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'stretch', overflow: 'hidden',
      }}
    >
      <span aria-hidden="true" style={{ width: 5, flexShrink: 0, background: meta.color }} />
      <div style={{ flex: 1, minWidth: 0, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 24, padding: '0 9px', borderRadius: 8,
            background: `${meta.color}1F`, border: `1px solid ${meta.color}66`,
            color: meta.color, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0,
          }}>
            <OutcomeIcon size={12} /> {meta.label}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
            fontFamily: '"JetBrains Mono", monospace', flexShrink: 0,
          }}>
            {day} {month}
          </span>
          <TicketIdBadge report={report} style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            color: 'var(--color-text-muted)', fontFamily: '"JetBrains Mono", monospace',
          }} />
        </div>

        <div style={{
          fontSize: 16.5, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.2,
          color: 'var(--color-text)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {report.title}
        </div>

        {((showMachine && report.machine) || report.component_name) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, minWidth: 0 }}>
            {showMachine && report.machine && (
              <>
                <Cog size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                <span style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {report.machine}
                </span>
              </>
            )}
            {report.component_name && (
              <ComponentPill name={report.component_name} size="sm" style={{ flexShrink: 1, minWidth: 0 }} />
            )}
          </div>
        )}

        {outcome !== 'senza' && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            marginTop: 10, padding: '9px 10px', borderRadius: 10,
            background: 'var(--color-surface-2)',
          }}>
            <ClosureLine label="Causa" text={closure.rootCause || 'Non indicata'} missing={!closure.rootCause} />
            <ClosureLine label="Azione" text={closure.action || 'Non indicata'} missing={!closure.action} />
          </div>
        )}

        {footer.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px',
            marginTop: 9, minWidth: 0,
          }}>
            {footer.map(({ icon: Icon, text }) => (
              <span key={text} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%',
                fontSize: 12, color: 'var(--color-text-muted)',
              }}>
                <Icon size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

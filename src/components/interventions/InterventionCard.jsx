// Card riutilizzabile per liste di interventi (lista del giorno, pannello
// fornitore, sezione "Interventi pianificati" nel report detail).
//
// Mostra: data/ora, titolo, assegnatario, macchinario, badge stato+tipo.

import { ChevronRight, User as UserIcon, Wrench } from 'lucide-react'
import { formatScheduledShort, isOverdue } from '../../lib/interventions'
import InterventionBadge from './InterventionBadge'

export default function InterventionCard({ intervention, onClick, compact = false }) {
  if (!intervention) return null
  const overdue = isOverdue(intervention)

  const padding = compact ? '10px 12px' : '12px 14px'
  const fontSizeTitle = compact ? 13 : 14

  return (
    <button
      onClick={onClick}
      className="press-scale"
      style={{
        width: '100%',
        padding,
        background: 'var(--color-surface-2)',
        border: `1px solid ${overdue ? 'rgba(239,68,68,0.4)' : 'var(--color-border)'}`,
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: fontSizeTitle, fontWeight: 700, color: 'var(--color-text)',
            margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {intervention.title}
          </p>
          <p style={{
            fontSize: 11, color: 'var(--color-text-secondary)',
            margin: '2px 0 0',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              {formatScheduledShort(intervention.scheduled_start_at)}
            </span>
            {intervention.machine_name && (
              <>
                <span aria-hidden>·</span>
                <Wrench size={11} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {intervention.machine_name}
                </span>
              </>
            )}
          </p>
        </div>
        {onClick && (
          <ChevronRight size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <InterventionBadge field="status" value={intervention.status} />
        <InterventionBadge field="type" value={intervention.type} showIcon={false} />
        {intervention.severity && intervention.severity !== 'media' && (
          <InterventionBadge field="severity" value={intervention.severity} showIcon={false} />
        )}
        {intervention.assigned_to_name && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 10, color: 'var(--color-text-secondary)',
            marginLeft: 'auto',
          }}>
            <UserIcon size={10} /> {intervention.assigned_to_name}
          </span>
        )}
      </div>

      {overdue && (
        <p style={{
          fontSize: 10, color: '#ef4444', margin: 0,
          fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
        }}>
          ⏰ In ritardo
        </p>
      )}
    </button>
  )
}

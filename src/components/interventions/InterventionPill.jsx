// Pill compatta dell'intervento per la griglia mese del calendario admin.
// Una riga per intervento dentro la cella del giorno; ellipsis se troppo lungo.

import { INTERVENTION_STATUSES, INTERVENTION_TYPES } from '../../lib/interventions'

export default function InterventionPill({ intervention, onClick, active = false }) {
  if (!intervention) return null
  const statusMeta = INTERVENTION_STATUSES[intervention.status] || INTERVENTION_STATUSES.pianificato
  const typeMeta = INTERVENTION_TYPES[intervention.type] || null

  // Colore principale = type (rosa, ciano, emerald, viola). Bordo = status.
  const bg = typeMeta ? `${typeMeta.color}22` : statusMeta.bg
  const border = statusMeta.color
  const text = typeMeta ? typeMeta.color : statusMeta.color

  const hh = intervention.scheduled_start_at
    ? new Date(intervention.scheduled_start_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(intervention) }}
      className="press-scale"
      style={{
        width: '100%',
        textAlign: 'left',
        background: bg,
        border: `1px solid ${active ? border : 'transparent'}`,
        borderLeft: `3px solid ${border}`,
        borderRadius: 6,
        padding: '3px 6px',
        marginBottom: 3,
        cursor: 'pointer',
        fontSize: 11,
        color: text,
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {hh && (
        <span style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, opacity: 0.85, flexShrink: 0,
        }}>{hh}</span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {intervention.title}
      </span>
    </button>
  )
}

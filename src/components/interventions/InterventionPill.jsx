// Pill compatta dell'intervento per la griglia mese del calendario admin.
// Una riga per intervento dentro la cella del giorno; ellipsis se troppo lungo.

import { INTERVENTION_STATUSES, INTERVENTION_TYPES } from '../../lib/interventions'

// Multi-day rendering: continuesLeft/continuesRight indicano che la pillola
// "prosegue" verso la cella adiacente. La pillola si estende con marginLeft/
// Right negativi per coprire il padding (6px) e il borderRight (1px) della
// cella, producendo una barra visiva continua tra giorni adiacenti dentro la
// stessa riga settimanale. Z-index 1 per stare sopra al border-right cella.
export default function InterventionPill({
  intervention,
  onClick,
  active = false,
  continuesLeft = false,
  continuesRight = false,
}) {
  if (!intervention) return null
  const statusMeta = INTERVENTION_STATUSES[intervention.status] || INTERVENTION_STATUSES.pianificato
  const typeMeta = INTERVENTION_TYPES[intervention.type] || null

  // Colore principale = type (rosa, ciano, emerald, viola). Bordo = status.
  const bg = typeMeta ? `${typeMeta.color}22` : statusMeta.bg
  const border = statusMeta.color
  const text = typeMeta ? typeMeta.color : statusMeta.color

  // L'orario appare solo all'inizio dello span visibile (primo giorno o
  // primo giorno dopo un a-capo di settimana). Sui giorni di continuazione
  // il titolo va a tutta larghezza.
  const hh = intervention.scheduled_start_at && !continuesLeft
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
        // Bordo-bandiera sinistro solo all'inizio dello span. Sui giorni
        // di continuazione la barra è uniforme senza tacca.
        borderLeft: continuesLeft ? '1px solid transparent' : `3px solid ${border}`,
        borderTopLeftRadius: continuesLeft ? 0 : 6,
        borderBottomLeftRadius: continuesLeft ? 0 : 6,
        borderTopRightRadius: continuesRight ? 0 : 6,
        borderBottomRightRadius: continuesRight ? 0 : 6,
        padding: '3px 6px',
        marginBottom: 3,
        // Bleed orizzontale: -6 per coprire il padding cella, +1 a destra
        // per coprire anche il borderRight della cella sorgente.
        marginLeft: continuesLeft ? -6 : 0,
        marginRight: continuesRight ? -7 : 0,
        position: 'relative',
        zIndex: 1,
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

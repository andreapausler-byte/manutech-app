/**
 * ComponentPill — il pezzo, ovunque compaia un ticket o un intervento
 *
 * Una sola pastiglia per tutta l'app: stesso ciano e stessa icona del tab
 * Componenti, così l'occhio la lega alla scheda del pezzo senza doverla
 * leggere. Nasce dallo studio del 26/8: `reports.component_id` esisteva
 * dalla 021 ma non lo mostrava nessuna vista, quindi nessuno lo compilava.
 *
 * Tre taglie: `xs` per le righe di lista fitte (admin), `sm` per le liste
 * mobile, `md` per le intestazioni di dettaglio.
 */

import { Package } from 'lucide-react'

const CYAN = '#22d3ee'

const SIZES = {
  xs: { font: 10,   icon: 10, padY: 2, padX: 6, gap: 3, radius: 4 },
  sm: { font: 11.5, icon: 12, padY: 3, padX: 7, gap: 4, radius: 6 },
  md: { font: 13,   icon: 14, padY: 5, padX: 9, gap: 5, radius: 8 },
}

export default function ComponentPill({ name, size = 'sm', title, style, className }) {
  if (!name) return null
  const s = SIZES[size] || SIZES.sm
  return (
    <span
      className={className}
      title={title || `Componente: ${name}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: s.gap,
        padding: `${s.padY}px ${s.padX}px`, borderRadius: s.radius,
        fontSize: s.font, fontWeight: 600, lineHeight: 1.3,
        background: 'rgba(34,211,238,0.12)',
        border: '1px solid rgba(34,211,238,0.35)',
        color: CYAN, whiteSpace: 'nowrap', maxWidth: '100%',
        overflow: 'hidden', textOverflow: 'ellipsis',
        ...style,
      }}
    >
      <Package size={s.icon} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
    </span>
  )
}

export { CYAN as COMPONENT_CYAN }

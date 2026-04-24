import { STATUS } from '../../lib/constants'

// Pill per lo stato di un report. Usa i colori già definiti in constants.js
// ma con stile brutalista coerente con l'operator app.
export default function StatusPill({ status }) {
  const cfg = STATUS[status] || { label: status || '—', color: '#6f957f' }
  return (
    <span className="op-pill" style={{ color: cfg.color }}>
      {(cfg.label || status || '—').toString()}
    </span>
  )
}

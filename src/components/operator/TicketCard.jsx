import PriorityDot from './PriorityDot'
import StatusPill from './StatusPill'
import { timeAgo } from '../../lib/constants'

function shortId(id) {
  if (!id) return '—'
  const s = id.toString()
  return s.length > 8 ? `#${s.slice(0, 8).toUpperCase()}` : `#${s.toUpperCase()}`
}

export default function TicketCard({ report, onClick }) {
  if (!report) return null
  return (
    <button
      className="op-ticket"
      onClick={() => onClick?.(report)}
      aria-label={`Apri ticket ${report.title || shortId(report.id)}`}
      style={{ textAlign: 'left', width: '100%' }}
    >
      <div className="op-ticket__head">
        <span className="op-ticket__id">{shortId(report.id)}</span>
        <StatusPill status={report.status} />
      </div>
      <div className="op-ticket__title">{report.title || '(senza titolo)'}</div>
      <div className="op-ticket__meta">
        <PriorityDot priority={report.severity} />
        <span>{report.machine || '—'}</span>
        <span style={{ marginLeft: 'auto' }}>{timeAgo(report.created_at)}</span>
      </div>
    </button>
  )
}

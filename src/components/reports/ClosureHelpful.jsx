/**
 * ClosureHelpful — "Mi è servita" sotto una chiusura.
 *
 * Chi legge la chiusura per lavorarci la vota; chi l'ha scritta vede a
 * quanti colleghi è servita, con i nomi. È il riconoscimento per la parte
 * del lavoro che nessuno vede: scrivere bene cosa si è fatto.
 *
 * Solo CSS vars: compare sia nel dettaglio mobile sia nel modal admin.
 */
import { ThumbsUp } from 'lucide-react'
import { useClosureHelpful } from '../../hooks/useClosureHelpful'

export default function ClosureHelpful({ report, user, style }) {
  const { votes, mine, canVote, isCloser, busy, toggle } = useClosureHelpful(report, user)
  const count = votes.length
  if (!canVote && count === 0) return null

  const names = votes.map(v => (v.user_name || 'Collega').split(' ')[0]).join(', ')
  const others = mine ? count - 1 : count
  const author = report.assigned_to_name?.split(' ')[0] || 'chi l\'ha scritta'
  const summary = isCloser || !canVote
    ? `È servita a ${count} ${count === 1 ? 'collega' : 'colleghi'}: ${names}`
    : others > 0
      ? `Servita anche a ${others === 1 ? '1 collega' : `${others} colleghi`}`
      : mine
        ? `${author.charAt(0).toUpperCase()}${author.slice(1)} riceve il tuo grazie`
        : `Ti ha fatto risparmiare tempo? Dillo a ${author}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, ...style }}>
      {canVote && (
        <button
          onClick={toggle}
          disabled={busy}
          aria-pressed={!!mine}
          className="press-scale"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            minHeight: 36, padding: '0 12px', borderRadius: 10,
            fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
            border: `1px solid ${mine ? 'rgba(16,185,129,0.55)' : 'var(--color-border)'}`,
            background: mine ? 'rgba(16,185,129,0.14)' : 'transparent',
            color: mine ? '#10b981' : 'var(--color-text-secondary)',
          }}
        >
          <ThumbsUp size={14} fill={mine ? 'currentColor' : 'none'} />
          {mine ? 'Ti è servita' : 'Mi è servita'}
          {count > 0 && <span style={{ fontWeight: 600, opacity: 0.8 }}>· {count}</span>}
        </button>
      )}
      {!canVote && <ThumbsUp size={14} style={{ color: '#10b981', flexShrink: 0 }} />}
      <span style={{
        fontSize: 11.5, color: 'var(--color-text-muted)', lineHeight: 1.35,
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {summary}
      </span>
    </div>
  )
}

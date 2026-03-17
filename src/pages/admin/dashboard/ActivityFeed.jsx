import { STATUS, SEVERITY, timeAgo } from '../../../lib/constants'
import { Badge } from '../../../components/ui'
import {
  FileText, Zap, ArrowRight, MessageCircle, UserCheck, ChevronRight
} from 'lucide-react'

const ACTIVITY_ICONS = {
  created:       { icon: FileText,      color: '#7c6aff' },
  quick_created: { icon: Zap,           color: '#f59e0b' },
  status_change: { icon: ArrowRight,    color: '#a855f7' },
  comment:       { icon: MessageCircle, color: '#6366f1' },
  assigned:      { icon: UserCheck,     color: '#8b5cf6' },
}

export default function ActivityFeed({ activities, reports, onNavigate }) {
  return (
    <div className="card-elevated" style={{ borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Attività recente</h3>
        <button onClick={() => onNavigate?.('reports')} style={{
          fontSize: 12, fontWeight: 600, color: '#8b5cf6',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          Vedi tutte <ChevronRight size={12} />
        </button>
      </div>

      {activities.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {activities.slice(0, 8).map((act, i) => {
            const config = ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.created
            const Icon = config.icon
            return (
              <div key={act.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 12,
                transition: 'background 0.15s',
                cursor: 'default',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: `${config.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={14} style={{ color: config.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {act.type === 'status_change' && act.to_status
                      ? `Stato → ${STATUS[act.to_status]?.label || act.to_status}`
                      : act.type === 'comment'
                      ? `"${(act.detail || 'Commento').slice(0, 50)}"`
                      : act.type === 'quick_created'
                      ? 'Report rapido creato'
                      : 'Segnalazione creata'}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 1 }}>{act.user_name || '—'}</p>
                </div>
                {act.type === 'status_change' && act.to_status && (
                  <Badge {...(STATUS[act.to_status] || {})} />
                )}
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0, width: 72, textAlign: 'right' }}>
                  {timeAgo(act.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {reports.slice(0, 8).map((r) => {
            const st = STATUS[r.status] || STATUS.aperta
            const sev = SEVERITY[r.severity] || SEVERITY.media
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
              }}
                onClick={() => onNavigate?.('reports')}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <Badge {...sev} />
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0, width: 72, textAlign: 'right' }}>{timeAgo(r.created_at)}</span>
              </div>
            )
          })}
          {reports.length === 0 && <p style={{ textAlign: 'center', padding: '30px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>Nessuna segnalazione registrata</p>}
        </div>
      )}
    </div>
  )
}

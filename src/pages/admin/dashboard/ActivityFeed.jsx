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
    <div className="col-span-3 card-elevated rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Attività Recente</h3>
        <button onClick={() => onNavigate?.('reports')} className="text-xs text-violet-400 hover:text-violet-300 font-medium flex items-center gap-0.5">
          Vedi tutte <ChevronRight size={12} />
        </button>
      </div>

      {activities.length > 0 ? (
        <div className="space-y-1">
          {activities.slice(0, 12).map((act, i) => {
            const config = ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.created
            const Icon = config.icon
            return (
              <div key={act.id || i} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-2 transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: config.color + '18' }}>
                  <Icon size={14} style={{ color: config.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] text-white truncate">
                    {act.type === 'status_change' && act.to_status
                      ? `Stato → ${STATUS[act.to_status]?.label || act.to_status}`
                      : act.type === 'comment'
                      ? `"${(act.detail || 'Commento').slice(0, 50)}"`
                      : act.type === 'quick_created'
                      ? 'Report rapido creato'
                      : 'Segnalazione creata'}
                  </p>
                  <p className="text-xs text-faint">{act.user_name || '—'}</p>
                </div>
                {act.type === 'status_change' && act.to_status && (
                  <Badge {...(STATUS[act.to_status] || {})} />
                )}
                <span className="text-sm text-faint shrink-0 w-20 text-right">{timeAgo(act.created_at)}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {reports.slice(0, 10).map((r) => {
            const st = STATUS[r.status] || STATUS.aperta
            const sev = SEVERITY[r.severity] || SEVERITY.media
            return (
              <div key={r.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => onNavigate?.('reports')}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />
                <span className="text-[15px] text-white flex-1 truncate">{r.title}</span>
                <Badge {...sev} />
                <span className="text-sm text-faint shrink-0 w-20 text-right">{timeAgo(r.created_at)}</span>
              </div>
            )
          })}
          {reports.length === 0 && <p className="text-center py-10 text-faint">Nessuna segnalazione registrata</p>}
        </div>
      )}
    </div>
  )
}

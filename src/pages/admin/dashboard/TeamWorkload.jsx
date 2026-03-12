import { ChevronRight } from 'lucide-react'

export default function TeamWorkload({ users, reports, onNavigate }) {
  const workload = users
    .map(u => {
      let active = 0, resolved = 0, critical = 0, total = 0
      for (const r of reports) {
        if (r.assigned_to !== u.id) continue
        total++
        if (r.status === 'risolta') { resolved++ }
        else { active++; if (r.severity === 'critica' || r.severity === 'alta') critical++ }
      }
      return { ...u, active, resolved, total, critical }
    })
    .filter(u => u.total > 0)
    .sort((a, b) => b.active - a.active)

  const maxActive = Math.max(...workload.map(u => u.active), 1)

  return (
    <div className="card-elevated rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Carico di Lavoro</h3>
        <button onClick={() => onNavigate?.('users')} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-0.5">
          Gestisci <ChevronRight size={12} />
        </button>
      </div>

      <div className="space-y-2.5">
        {workload.length === 0 ? (
          <p className="text-sm text-faint text-center py-6">Nessuna segnalazione assegnata</p>
        ) : (
          workload.map(u => {
            const roleIcon = u.role === 'tecnico' ? '🔧' : u.role === 'admin' ? '👔' : '👷'
            const roleColor = u.role === 'tecnico' ? '#22c55e' : u.role === 'admin' ? '#f59e0b' : '#3b82f6'
            const loadPct = (u.active / maxActive) * 100
            const isOverloaded = u.active >= 4

            return (
              <div key={u.id} className="p-3 bg-surface-2 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: roleColor + '18' }}>
                    {roleIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.name}</p>
                    <p className="text-[11px] text-faint capitalize">{u.role}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {u.critical > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{u.critical} urg</span>
                    )}
                    <span className={`text-lg font-bold ${isOverloaded ? 'text-red-400' : u.active > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {u.active}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-surface-1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${loadPct}%`,
                        background: isOverloaded ? '#ef4444' : u.active > 2 ? '#f59e0b' : '#22c55e'
                      }} />
                  </div>
                  <span className="text-[10px] text-faint w-16 text-right">{u.resolved} risolte</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-token grid grid-cols-3 gap-2">
        {(() => {
          const counts = { admin: 0, tecnico: 0, operatore: 0 }
          for (const u of users) if (counts[u.role] !== undefined) counts[u.role]++
          return [
            { label: 'Admin', count: counts.admin, color: '#f59e0b' },
            { label: 'Tecnici', count: counts.tecnico, color: '#22c55e' },
            { label: 'Operatori', count: counts.operatore, color: '#3b82f6' },
          ]
        })().map(({ label, count }) => (
          <div key={label} className="text-center p-2 bg-surface-1 rounded-lg">
            <p className="text-lg font-bold text-themed">{count}</p>
            <p className="text-[10px] text-faint uppercase">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

import { CheckCircle, ChevronRight, Cog, AlertTriangle, Shield } from 'lucide-react'

export default function MaintenanceSummary({ maintenanceTasks, nonAssegnate, reports, onNavigate }) {
  return (
    <div className="col-span-2 space-y-5">
      {/* Segnalazioni da assegnare */}
      <div className={`border rounded-2xl p-5 ${nonAssegnate > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-surface-1/80 border-token'}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${nonAssegnate > 0 ? 'bg-amber-500/20' : 'bg-surface-2'}`}>
            <AlertTriangle size={18} className={nonAssegnate > 0 ? 'text-amber-400' : 'text-faint'} />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{nonAssegnate}</p>
            <p className="text-sm text-muted">Da assegnare</p>
          </div>
        </div>
        {nonAssegnate > 0 && (
          <button onClick={() => onNavigate?.('reports')}
            className="w-full py-2.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-sm font-semibold rounded-xl transition-colors">
            Assegna ora →
          </button>
        )}
      </div>

      {/* Stato Manutenzioni Programmate */}
      <div className="card-elevated rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Manutenzioni</h3>
          <button onClick={() => onNavigate?.('maintenance')} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-0.5">
            Gestisci <ChevronRight size={12} />
          </button>
        </div>

        {(() => {
          const overdue = maintenanceTasks.filter(t => t.light.color === '#ef4444')
          const warning = maintenanceTasks.filter(t => t.light.color === '#f59e0b')
          const ok = maintenanceTasks.filter(t => t.light.color === '#22c55e')

          if (maintenanceTasks.length === 0) {
            return <p className="text-sm text-faint text-center py-4">Nessun piano configurato</p>
          }

          return (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className={`rounded-xl p-2.5 text-center ${overdue.length > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-surface-2'}`}>
                  <p className={`text-xl font-bold ${overdue.length > 0 ? 'text-red-400' : 'text-white'}`}>{overdue.length}</p>
                  <p className="text-[10px] text-faint">Scadute</p>
                </div>
                <div className={`rounded-xl p-2.5 text-center ${warning.length > 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-surface-2'}`}>
                  <p className={`text-xl font-bold ${warning.length > 0 ? 'text-amber-400' : 'text-white'}`}>{warning.length}</p>
                  <p className="text-[10px] text-faint">In scadenza</p>
                </div>
                <div className="bg-surface-2 rounded-xl p-2.5 text-center">
                  <p className="text-xl font-bold text-emerald-400">{ok.length}</p>
                  <p className="text-[10px] text-faint">In regola</p>
                </div>
              </div>

              {[...overdue, ...warning].length > 0 ? (
                <div className="space-y-2">
                  {[...overdue, ...warning].slice(0, 5).map((task, i) => (
                    <div key={`${task.plan.id}-${i}`} className="flex items-center gap-3 p-2.5 bg-surface-2 rounded-xl">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: task.light.color, boxShadow: `0 0 8px ${task.light.color}40` }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-themed font-medium truncate">{task.plan.name}</p>
                        <p className="text-[11px] text-faint truncate">
                          <Cog size={10} className="inline mr-1" />{task.machine.name}
                          {task.plan.assigned_to_name && <> · 👤 {task.plan.assigned_to_name}</>}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0" style={{ background: task.light.color + '18', color: task.light.color }}>
                        {task.light.label}
                      </span>
                    </div>
                  ))}
                  {[...overdue, ...warning].length > 5 && (
                    <p className="text-xs text-faint text-center py-1">+ {[...overdue, ...warning].length - 5} altre</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
                  <CheckCircle size={18} className="text-emerald-400 shrink-0" />
                  <p className="text-sm text-emerald-400 font-medium">Tutte le manutenzioni in regola</p>
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

import { Timer, TrendingUp, CheckCircle, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function TimeKPIs({ kpi }) {
  return (
    <div className="grid grid-cols-4 gap-5">
      <div className="card-elevated rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Timer size={16} className="text-cyan-400" />
          <span className="text-xs text-muted uppercase tracking-wider font-semibold">Tempo Medio</span>
        </div>
        <p className="text-3xl font-bold text-white">{kpi.avgResolutionLabel}</p>
        <p className="text-xs text-faint mt-1">dalla creazione alla risoluzione</p>
      </div>

      <div className="card-elevated rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-violet-400" />
          <span className="text-xs text-muted uppercase tracking-wider font-semibold">Questa Settimana</span>
        </div>
        <div className="flex items-end gap-2">
          <p className="text-3xl font-bold text-white">{kpi.reportsThisWeek}</p>
          {kpi.weeklyTrend.change !== 0 && (
            <span className={`text-sm font-bold flex items-center mb-1 ${kpi.weeklyTrend.change > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {kpi.weeklyTrend.change > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(kpi.weeklyTrend.change)}%
            </span>
          )}
        </div>
        <p className="text-xs text-faint mt-1">vs {kpi.reportsLastWeek} settimana scorsa</p>
      </div>

      <div className="card-elevated rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle size={16} className="text-emerald-400" />
          <span className="text-xs text-muted uppercase tracking-wider font-semibold">Risolte</span>
        </div>
        <p className="text-3xl font-bold text-emerald-400">{kpi.resolvedThisWeek}</p>
        <p className="text-xs text-faint mt-1">chiuse questa settimana</p>
      </div>

      <div className="card-elevated rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-amber-400" />
          <span className="text-xs text-muted uppercase tracking-wider font-semibold">Report Rapidi</span>
        </div>
        <p className="text-3xl font-bold text-amber-400">{kpi.quickReportPct}%</p>
        <div className="flex items-end gap-0.5 mt-2 h-8">
          {kpi.dailyDistribution.map((count, i) => {
            const max = Math.max(...kpi.dailyDistribution, 1)
            return (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-violet-500/60 rounded-sm min-h-[2px] transition-all"
                  style={{ height: `${(count / max) * 100}%` }}
                />
                <span className="text-[8px] text-faint mt-0.5">{kpi.dayLabels?.[i]?.[0]}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { STATUS, SEVERITY } from '../../../lib/constants'
import { Badge } from '../../../components/ui'

export default function ResolutionChart({ reports, stats, resolveRate }) {
  return (
    <div className="grid grid-cols-3 gap-5">
      {/* Resolution Rate */}
      <div className="card-elevated rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-6">Tasso Risoluzione</h3>
        <div className="flex items-center justify-center">
          <div className="relative w-40 h-40">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#1f2937" strokeWidth="10" />
              <circle cx="60" cy="60" r="50" fill="none" stroke="#22c55e" strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${resolveRate * 3.14} ${314 - resolveRate * 3.14}`}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-white">{resolveRate}%</span>
              <span className="text-xs text-faint">{stats.risolte}/{stats.total}</span>
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="bg-surface-2 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-themed">{stats.total}</p>
            <p className="text-[11px] text-faint mt-0.5">Totali</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-400">{stats.risolte}</p>
            <p className="text-[11px] text-faint mt-0.5">Chiuse</p>
          </div>
        </div>
      </div>

      {/* Severity Breakdown */}
      <div className="card-elevated rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-6">Distribuzione Gravità</h3>
        <div className="space-y-4">
          {Object.entries(SEVERITY).map(([key, { label, color }]) => {
            const count = reports.filter(r => r.severity === key).length
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <span className="text-sm text-secondary font-medium">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{count}</span>
                    <span className="text-xs text-faint w-10 text-right">{pct}%</span>
                  </div>
                </div>
                <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 pt-5 border-t border-token">
          <p className="text-[11px] text-faint uppercase tracking-wider mb-3">Per Stato</p>
          <div className="flex gap-1.5 h-8 rounded-lg overflow-hidden">
            {Object.entries(STATUS).map(([key, { label, color }]) => {
              const count = reports.filter(r => r.status === key).length
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              if (pct === 0) return null
              return (
                <div key={key} className="flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                  style={{ width: `${pct}%`, background: color, minWidth: pct > 0 ? '24px' : 0 }}
                  title={`${label}: ${count}`}
                >
                  {count}
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-2.5">
            {Object.entries(STATUS).map(([key, { label, color }]) => (
              <span key={key} className="flex items-center gap-1.5 text-[11px] text-faint">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

import { AlertTriangle, Wrench, CheckCircle, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function HeroKPIs({ stats, resolveRate, urgenti, nonAssegnate }) {
  const cards = [
    {
      label: 'Segnalazioni Aperte',
      value: stats.aperte,
      sub: `${nonAssegnate} non assegnate`,
      icon: AlertTriangle,
      color: '#f59e0b',
      gradient: 'from-amber-500/15 to-amber-600/5',
      trend: stats.aperte > 0 ? 'up' : null,
    },
    {
      label: 'In Lavorazione',
      value: stats.assegnate + stats.inCorso,
      sub: `${stats.tecnici} tecnici attivi`,
      icon: Wrench,
      color: '#a855f7',
      gradient: 'from-purple-500/15 to-purple-600/5',
      trend: null,
    },
    {
      label: 'Risolte',
      value: stats.risolte,
      sub: `${resolveRate}% tasso risoluzione`,
      icon: CheckCircle,
      color: '#22c55e',
      gradient: 'from-emerald-500/15 to-emerald-600/5',
      trend: resolveRate > 50 ? 'up' : 'down',
    },
    {
      label: 'Urgenti',
      value: urgenti,
      sub: `${stats.critiche} critiche, ${stats.alte} alte`,
      icon: Activity,
      color: urgenti > 0 ? '#ef4444' : '#22c55e',
      gradient: urgenti > 0 ? 'from-red-500/15 to-red-600/5' : 'from-emerald-500/15 to-emerald-600/5',
      trend: urgenti > 0 ? 'up' : null,
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-5">
      {cards.map(({ label, value, sub, icon: Icon, color, gradient, trend }) => (
        <div key={label} className={`bg-gradient-to-br ${gradient} border border-token rounded-2xl p-6 transition-all hover:border-token`}>
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
              <Icon size={22} style={{ color }} />
            </div>
            {trend && (
              <div className={`flex items-center gap-0.5 text-xs font-semibold ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              </div>
            )}
          </div>
          <p className="text-4xl font-bold text-themed tracking-tight">{value}</p>
          <p className="text-sm text-secondary font-medium mt-1">{label}</p>
          <p className="text-xs text-faint mt-1">{sub}</p>
        </div>
      ))}
    </div>
  )
}

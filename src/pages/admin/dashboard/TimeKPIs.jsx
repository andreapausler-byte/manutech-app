import { Timer, TrendingUp, CheckCircle, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function TimeKPIs({ kpi }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {/* Tempo Medio */}
      <div className="card-elevated" style={{ borderRadius: 16, padding: '20px 20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#06b6d415', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Timer size={16} style={{ color: '#06b6d4' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Tempo medio</span>
        </div>
        <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>{kpi.avgResolutionLabel}</p>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>dalla creazione alla risoluzione</p>
      </div>

      {/* Questa Settimana */}
      <div className="card-elevated" style={{ borderRadius: 16, padding: '20px 20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#8b5cf615', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={16} style={{ color: '#8b5cf6' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Questa settimana</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>{kpi.reportsThisWeek}</p>
          {kpi.weeklyTrend.change !== 0 && (
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: kpi.weeklyTrend.change > 0 ? '#ef4444' : '#22c55e',
              display: 'inline-flex', alignItems: 'center',
            }}>
              {kpi.weeklyTrend.change > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(kpi.weeklyTrend.change)}%
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>vs {kpi.reportsLastWeek} settimana scorsa</p>
      </div>

      {/* Risolte */}
      <div className="card-elevated" style={{ borderRadius: 16, padding: '20px 20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#22c55e15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={16} style={{ color: '#22c55e' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Risolte</span>
        </div>
        <p style={{ fontSize: 28, fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{kpi.resolvedThisWeek}</p>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>chiuse questa settimana</p>
      </div>

      {/* Report Rapidi + Sparkline */}
      <div className="card-elevated" style={{ borderRadius: 16, padding: '20px 20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f59e0b15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={16} style={{ color: '#f59e0b' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Report rapidi</span>
        </div>
        <p style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>{kpi.quickReportPct}%</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, marginTop: 10, height: 28 }}>
          {kpi.dailyDistribution.map((count, i) => {
            const max = Math.max(...kpi.dailyDistribution, 1)
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '100%', borderRadius: 3, minHeight: 2,
                  height: `${(count / max) * 100}%`,
                  background: '#8b5cf6',
                  opacity: 0.7,
                  transition: 'height 0.5s ease',
                }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 3 }}>{kpi.dayLabels?.[i]?.[0]}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

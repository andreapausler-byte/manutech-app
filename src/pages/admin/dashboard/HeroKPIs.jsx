import { AlertCircle, Loader, CheckCircle2, AlertTriangle } from 'lucide-react'
import { CountUp } from '../../../hooks/usePremiumUI'

export default function HeroKPIs({ stats, resolveRate, urgenti, nonAssegnate }) {
  const cards = [
    {
      label: 'Aperti',
      value: stats.aperte,
      subtitle: nonAssegnate > 0 ? `${nonAssegnate} da assegnare` : 'Tutti assegnati',
      icon: AlertCircle,
      color: '#ef4444',
      pulse: nonAssegnate > 0,
    },
    {
      label: 'In Corso',
      value: stats.assegnate + stats.inCorso,
      subtitle: `${stats.assegnate} assegnati · ${stats.inCorso} in lavorazione`,
      icon: Loader,
      color: '#3b82f6',
    },
    {
      label: 'Completati',
      value: stats.risolte,
      subtitle: `${resolveRate}% tasso risoluzione`,
      icon: CheckCircle2,
      color: '#22c55e',
    },
    {
      label: 'Urgenti',
      value: urgenti,
      subtitle: `${stats.critiche} critiche · ${stats.alte} alta priorità`,
      icon: AlertTriangle,
      color: '#f59e0b',
      pulse: urgenti > 0,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {cards.map(({ label, value, subtitle, icon: Icon, color, pulse }) => (
        <div key={label} className="card-3d" style={{
          position: 'relative',
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderTop: `3px solid ${color}`,
          borderRadius: 16,
          padding: '20px 20px 18px',
          animation: pulse ? 'pulse 3s ease-in-out infinite' : undefined,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${color}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={18} style={{ color }} />
            </div>
            <span style={{
              fontSize: 36, fontWeight: 800, color,
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1,
            }}>
              <CountUp value={value} />
            </span>
          </div>
          <p style={{
            fontSize: 14, fontWeight: 600, color: 'var(--color-text)',
            marginBottom: 2,
          }}>
            {label}
          </p>
          <p style={{
            fontSize: 12, color: 'var(--color-text-secondary)',
            lineHeight: 1.3,
          }}>
            {subtitle}
          </p>
        </div>
      ))}
    </div>
  )
}

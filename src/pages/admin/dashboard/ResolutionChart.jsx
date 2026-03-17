import { STATUS, SEVERITY } from '../../../lib/constants'

export default function ResolutionChart({ reports, stats, resolveRate }) {
  return (
    <>
      {/* Tasso Risoluzione */}
      <div className="card-elevated" style={{ borderRadius: 16, padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
          Tasso risoluzione
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 160, height: 160 }}>
            <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-border)" strokeWidth="10" />
              <circle cx="60" cy="60" r="50" fill="none" stroke="#22c55e" strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${resolveRate * 3.14} ${314 - resolveRate * 3.14}`}
                style={{ transition: 'stroke-dasharray 1s ease' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text)' }}>{resolveRate}%</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{stats.risolte}/{stats.total}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
          <div style={{ background: 'var(--color-surface-2)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>{stats.total}</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Totali</p>
          </div>
          <div style={{ background: 'var(--color-surface-2)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{stats.risolte}</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Chiuse</p>
          </div>
        </div>
      </div>

      {/* Distribuzione Gravità + Stato */}
      <div className="card-elevated" style={{ borderRadius: 16, padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
          Distribuzione gravità
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Object.entries(SEVERITY).map(([key, { label, color }]) => {
            const count = reports.filter(r => r.severity === key).length
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}40` }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{count}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)', width: 36, textAlign: 'right' }}>{pct}%</span>
                  </div>
                </div>
                <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: color, transition: 'width 0.7s ease' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Per Stato */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12 }}>Per stato</p>
          <div style={{ display: 'flex', gap: 4, height: 28, borderRadius: 8, overflow: 'hidden' }}>
            {Object.entries(STATUS).map(([key, { label, color }]) => {
              const count = reports.filter(r => r.status === key).length
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              if (pct === 0) return null
              return (
                <div key={key} title={`${label}: ${count}`} style={{
                  width: `${pct}%`, minWidth: pct > 0 ? 28 : 0,
                  background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff',
                  transition: 'width 0.5s ease',
                }}>
                  {count}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
            {Object.entries(STATUS).map(([key, { label, color }]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-text-muted)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

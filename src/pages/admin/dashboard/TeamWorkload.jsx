import { ChevronRight, Users } from 'lucide-react'

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

  const roleCounts = { admin: 0, tecnico: 0, operatore: 0 }
  for (const u of users) if (roleCounts[u.role] !== undefined) roleCounts[u.role]++

  return (
    <div className="card-elevated" style={{ borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={16} style={{ color: 'var(--color-text-muted)' }} />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Carico di lavoro</h3>
        </div>
        <button onClick={() => onNavigate?.('users')} style={{
          fontSize: 12, fontWeight: 600, color: '#8b5cf6',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          Gestisci <ChevronRight size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workload.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>Nessuna segnalazione assegnata</p>
        ) : (
          workload.map(u => {
            const roleIcon = u.role === 'tecnico' ? '🔧' : u.role === 'admin' ? '👔' : '👷'
            const loadPct = (u.active / maxActive) * 100
            const isOverloaded = u.active >= 4
            const barColor = isOverloaded ? '#ef4444' : u.active > 2 ? '#f59e0b' : '#22c55e'

            return (
              <div key={u.id} style={{
                background: 'var(--color-surface-2)',
                borderRadius: 12,
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: 'var(--color-surface-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15,
                  }}>
                    {roleIcon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{u.role}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {u.critical > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                        background: '#ef444418', color: '#ef4444',
                      }}>{u.critical} urg</span>
                    )}
                    <span style={{
                      fontSize: 20, fontWeight: 800,
                      color: isOverloaded ? '#ef4444' : u.active > 0 ? '#f59e0b' : '#22c55e',
                    }}>
                      {u.active}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 5, background: 'var(--color-surface-1)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${loadPct}%`,
                      background: barColor,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{u.resolved} risolte</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Role counts */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        marginTop: 16, paddingTop: 16,
        borderTop: '1px solid var(--color-border)',
      }}>
        {[
          { label: 'Admin', count: roleCounts.admin, color: '#f59e0b' },
          { label: 'Tecnici', count: roleCounts.tecnico, color: '#22c55e' },
          { label: 'Operatori', count: roleCounts.operatore, color: '#8b5cf6' },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            textAlign: 'center', padding: '10px 8px',
            background: 'var(--color-surface-1)', borderRadius: 10,
          }}>
            <p style={{ fontSize: 20, fontWeight: 700, color }}>{count}</p>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

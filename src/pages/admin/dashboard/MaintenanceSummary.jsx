import { CheckCircle, ChevronRight, Cog, AlertTriangle, Clock } from 'lucide-react'

export default function MaintenanceSummary({ maintenanceTasks, nonAssegnate, reports, onNavigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Da assegnare */}
      <div style={{
        background: nonAssegnate > 0 ? '#f59e0b08' : 'var(--color-card)',
        border: `1px solid ${nonAssegnate > 0 ? '#f59e0b30' : 'var(--color-border)'}`,
        borderRadius: 16, padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: nonAssegnate > 0 ? 14 : 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: nonAssegnate > 0 ? '#f59e0b18' : 'var(--color-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={18} style={{ color: nonAssegnate > 0 ? '#f59e0b' : 'var(--color-text-muted)' }} />
          </div>
          <div>
            <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text)' }}>{nonAssegnate}</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Da assegnare</p>
          </div>
        </div>
        {nonAssegnate > 0 && (
          <button onClick={() => onNavigate?.('reports')} style={{
            width: '100%', padding: '10px 0', borderRadius: 10,
            background: '#f59e0b18', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#f59e0b',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#f59e0b28'}
            onMouseLeave={e => e.currentTarget.style.background = '#f59e0b18'}
          >
            Assegna ora →
          </button>
        )}
      </div>

      {/* Manutenzioni */}
      <div className="card-elevated" style={{ borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={15} style={{ color: 'var(--color-text-muted)' }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Manutenzioni</h3>
          </div>
          <button onClick={() => onNavigate?.('maintenance')} style={{
            fontSize: 12, fontWeight: 600, color: '#8b5cf6',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 2,
          }}>
            Gestisci <ChevronRight size={12} />
          </button>
        </div>

        {(() => {
          if (maintenanceTasks.length === 0) {
            return <p style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0' }}>Nessun piano configurato</p>
          }

          const overdue = [], warning = [], ok = []
          for (const t of maintenanceTasks) {
            if (t.light.color === '#ff5c5c' || t.light.color === '#ef4444') overdue.push(t)
            else if (t.light.color === '#ffaa2c' || t.light.color === '#f59e0b') warning.push(t)
            else ok.push(t)
          }
          const urgent = [...overdue, ...warning]

          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: urgent.length > 0 ? 14 : 0 }}>
                <div style={{
                  borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                  background: overdue.length > 0 ? '#ef444412' : 'var(--color-surface-2)',
                  border: overdue.length > 0 ? '1px solid #ef444425' : '1px solid transparent',
                }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: overdue.length > 0 ? '#ef4444' : 'var(--color-text)' }}>{overdue.length}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Scadute</p>
                </div>
                <div style={{
                  borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                  background: warning.length > 0 ? '#f59e0b12' : 'var(--color-surface-2)',
                  border: warning.length > 0 ? '1px solid #f59e0b25' : '1px solid transparent',
                }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: warning.length > 0 ? '#f59e0b' : 'var(--color-text)' }}>{warning.length}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>In scadenza</p>
                </div>
                <div style={{ borderRadius: 10, padding: '10px 8px', textAlign: 'center', background: 'var(--color-surface-2)' }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{ok.length}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>In regola</p>
                </div>
              </div>

              {urgent.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {urgent.slice(0, 4).map((task, i) => (
                    <div key={`${task.plan.id}-${i}`} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 10,
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: task.light.color,
                        boxShadow: `0 0 8px ${task.light.color}50`,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.plan.name}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Cog size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                          {task.machine.name}
                        </p>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0,
                        background: `${task.light.color}18`, color: task.light.color,
                      }}>
                        {task.light.label}
                      </span>
                    </div>
                  ))}
                  {urgent.length > 4 && (
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', padding: '4px 0' }}>+ {urgent.length - 4} altre</p>
                  )}
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 10,
                  background: '#22c55e08', border: '1px solid #22c55e18',
                }}>
                  <CheckCircle size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>Tutte le manutenzioni in regola</p>
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

import { Shield } from 'lucide-react'

export default function MaintenanceAlertBanner({ maintenanceTasks, onNavigate }) {
  const overdueM = maintenanceTasks.filter(t => t.light.color === '#ff5c5c' || t.light.color === '#ef4444')
  const warningM = maintenanceTasks.filter(t => t.light.color === '#ffaa2c' || t.light.color === '#f59e0b')

  if (overdueM.length === 0 && warningM.length === 0) return null

  const isRed = overdueM.length > 0
  const color = isRed ? '#ef4444' : '#f59e0b'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 20px', borderRadius: 16,
      background: `${color}08`,
      border: `1px solid ${color}25`,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Shield size={22} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
          {isRed
            ? `${overdueM.length} manutenzion${overdueM.length === 1 ? 'e scaduta' : 'i scadute'}`
            : `${warningM.length} manutenzion${warningM.length === 1 ? 'e in scadenza' : 'i in scadenza'}`}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {overdueM.length > 0 && warningM.length > 0
            ? `${overdueM.length} scadute + ${warningM.length} in scadenza entro 7 giorni`
            : isRed ? 'Interventi urgenti richiesti' : 'Scadono entro 7 giorni'}
        </p>
      </div>
      <button onClick={() => onNavigate?.('maintenance')} style={{
        padding: '10px 20px', borderRadius: 10,
        fontSize: 13, fontWeight: 700, color: '#fff',
        background: color, border: 'none', cursor: 'pointer',
        flexShrink: 0, transition: 'opacity 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        Gestisci →
      </button>
    </div>
  )
}

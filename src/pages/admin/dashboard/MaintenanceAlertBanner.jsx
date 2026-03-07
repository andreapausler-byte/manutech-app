import { Shield } from 'lucide-react'

export default function MaintenanceAlertBanner({ maintenanceTasks, onNavigate }) {
  const overdueM = maintenanceTasks.filter(t => t.light.color === '#ef4444')
  const warningM = maintenanceTasks.filter(t => t.light.color === '#f59e0b')

  if (overdueM.length === 0 && warningM.length === 0) return null

  return (
    <div className={`border rounded-2xl p-5 flex items-center gap-4 ${overdueM.length > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${overdueM.length > 0 ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
        <Shield size={24} className={overdueM.length > 0 ? 'text-red-400' : 'text-amber-400'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-themed">
          {overdueM.length > 0
            ? `${overdueM.length} manutenzioni scadute`
            : `${warningM.length} manutenzioni in scadenza`}
        </p>
        <p className="text-sm text-muted mt-0.5">
          {overdueM.length > 0 && warningM.length > 0
            ? `${overdueM.length} scadute + ${warningM.length} in scadenza entro 7 giorni`
            : overdueM.length > 0
              ? 'Interventi urgenti richiesti'
              : 'Scadono entro 7 giorni'}
        </p>
      </div>
      <button onClick={() => onNavigate?.('maintenance')}
        className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white shrink-0 transition-colors ${overdueM.length > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
        Gestisci →
      </button>
    </div>
  )
}

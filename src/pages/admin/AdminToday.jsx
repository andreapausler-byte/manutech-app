// AdminToday — "Oggi per me" dentro la console admin.
//
// Stesso pannello del mobile (`MyDayPanel`), con due differenze che valgono
// solo qui: la sezione "Senza nessuno" — la coda che non è di nessuno, che
// interessa a chi assegna e a nessun altro — e la navigazione, che porta alle
// pagine della console invece che alle schermate del telefono.

import { useAuth } from '../../contexts/AuthContext'
import MyDayPanel from '../../components/myday/MyDayPanel'

export default function AdminToday({ onNavigate }) {
  const { user } = useAuth()

  return (
    <div style={{ maxWidth: 920 }}>
      <MyDayPanel
        user={user}
        variant="admin"
        includeUnassigned
        onOpenReport={(item) => onNavigate?.('reports', { reportId: item.id })}
        onOpenIntervention={(item) => onNavigate?.('calendar', {
          calendarInitialMonth: item.when ? new Date(item.when.getFullYear(), item.when.getMonth(), 1) : null,
          calendarOpenDay: item.when || null,
          calendarHighlightInterventionId: item.id,
        })}
        onOpenPlan={() => onNavigate?.('maintenance')}
      />
    </div>
  )
}

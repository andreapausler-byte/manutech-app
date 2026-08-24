/**
 * Semaforo delle manutenzioni programmate.
 *
 * Un piano è in regola finché non arriva la sua frequenza. Rosso quando
 * è scaduto, ambra nell'ultima settimana, verde altrimenti.
 *
 * NOTA: la stessa funzione è ancora copiata in AdminDashboard,
 * AdminMaintenance e MachineDetailSheet. Quando si toccano, vanno
 * ricondotte qui.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / DAY_MS)

export function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { daysLeft, label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', urgent: true }
  if (daysLeft <= 7) return { daysLeft, label: `Scade tra ${daysLeft}g`, color: '#f59e0b', urgent: true }
  return { daysLeft, label: `Tra ${daysLeft}g`, color: '#22c55e', urgent: false }
}

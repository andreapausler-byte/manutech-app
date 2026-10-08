/**
 * Pezzi condivisi della pagina Manutenzione della console: colori del
 * semaforo, quanto del ciclo è passato, stili delle etichette.
 *
 * Solo variabili CSS: dentro la console `.mt-scope` le porta sulla palette
 * Amarcord del design desktop (rosso, ambra, verde).
 */

export const MONO = 'var(--mt-font-mono)'

export const TONES = {
  overdue: { color: 'var(--color-danger)', dim: 'var(--color-red-bg)' },
  warning: { color: 'var(--color-warning)', dim: 'var(--color-orange-bg)' },
  ok:      { color: 'var(--color-primary)', dim: 'var(--color-green-bg)' },
}

export const STATUS_GROUPS = [
  { id: 'overdue', label: 'Scadute' },
  { id: 'warning', label: 'In scadenza · 7 giorni' },
  { id: 'ok',      label: 'In regola' },
]

// Quanto del ciclo è già passato: piena quando il piano è scaduto.
export function cyclePercent(task) {
  const freq = Number(task.plan.frequency_days) || 0
  const left = task.light.daysLeft
  if (left <= 0 || !freq) return 100
  return Math.max(0, Math.min(100, ((freq - left) / freq) * 100))
}

export const monoLabel = {
  fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 1,
  textTransform: 'uppercase', color: 'var(--color-text-muted)',
}

export const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

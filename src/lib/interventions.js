// ─── Costanti + utility pure per la nuova entità interventions. ───
//
// Type e severity sono allineati a quelli dei reports (vedi REPORT_TYPES e
// SEVERITY in constants.js). Importiamo da lì per non duplicare la sorgente
// di verità: se in futuro reports aggiunge un nuovo type/severity, anche
// gli interventi lo vedono automaticamente.

import { REPORT_TYPES, SEVERITY } from './constants'

// Re-export con alias per leggibilità nei componenti calendario.
export const INTERVENTION_TYPES = REPORT_TYPES
export const INTERVENTION_SEVERITIES = SEVERITY

// ─── Workflow specifico interventions ──────────────────────────────────
// I 6 stati. Palette pensata per il calendario: stati attivi/positivi caldi,
// stati di rischio (in_corso, annullato) saturati.
export const INTERVENTION_STATUSES = {
  bozza: {
    label: 'Bozza',
    color: '#9ca3af',
    bg: 'rgba(156,163,175,0.12)',
    icon: '✎',
  },
  pianificato: {
    label: 'Pianificato',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.12)',
    icon: '📅',
  },
  confermato: {
    label: 'Confermato',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.12)',
    icon: '✓',
  },
  in_corso: {
    label: 'In corso',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.14)',
    icon: '⚡',
  },
  completato: {
    label: 'Completato',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    icon: '✓✓',
  },
  annullato: {
    label: 'Annullato',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.10)',
    icon: '✗',
  },
}

// Origini di un intervento (FK valorizzata o manuale).
export const INTERVENTION_ORIGINS = {
  report:           { label: 'Da segnalazione', short: 'Report' },
  maintenance_plan: { label: 'Da piano manutenzione', short: 'Piano' },
  manuale:          { label: 'Pianificazione manuale', short: 'Manuale' },
}

// Stato di pianificazione aggregato sui reports (view reports_with_planning).
export const PLANNING_STATE = {
  da_pianificare: {
    label: 'Da pianificare',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    icon: '⚠',
  },
  pianificato: {
    label: 'Pianificato',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.12)',
    icon: '📅',
  },
  in_corso: {
    label: 'In corso',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.14)',
    icon: '⚡',
  },
  risolta: {
    label: 'Risolta',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    icon: '✓',
  },
  altro: {
    label: '—',
    color: '#9ca3af',
    bg: 'rgba(156,163,175,0.08)',
    icon: '·',
  },
}

// ─── Mapping legacy → interventions ────────────────────────────────────
// urgency di spare_part_orders → severity di interventions.
// "urgente" è il livello critico dello scheduler ricambi, mappa su "critica".
export const URGENCY_TO_SEVERITY = {
  bassa: 'bassa',
  media: 'media',
  alta: 'alta',
  urgente: 'critica',
}

// ─── Utility pure ──────────────────────────────────────────────────────

// True se l'intervento è in stato "pianificato" o "confermato" ed è in ritardo
// sulla data prevista.
export function isOverdue(intervention, now = new Date()) {
  if (!intervention) return false
  if (!['pianificato', 'confermato'].includes(intervention.status)) return false
  if (!intervention.scheduled_start_at) return false
  return new Date(intervention.scheduled_start_at) < now
}

export function isInProgress(intervention) {
  return intervention?.status === 'in_corso'
}

export function isTerminal(intervention) {
  return intervention && ['completato', 'annullato'].includes(intervention.status)
}

// Durata in minuti: preferisce estimated_duration_min, altrimenti calcola da
// scheduled_end - scheduled_start. Ritorna null se entrambi mancano.
export function getDurationMinutes(intervention) {
  if (!intervention) return null
  if (intervention.estimated_duration_min) return intervention.estimated_duration_min
  if (intervention.scheduled_start_at && intervention.scheduled_end_at) {
    const ms = new Date(intervention.scheduled_end_at) - new Date(intervention.scheduled_start_at)
    return Math.round(ms / 60000)
  }
  return null
}

// Format breve: "13/05, 09:30" oppure "—" se manca.
export function formatScheduledShort(scheduledAt) {
  if (!scheduledAt) return '—'
  const d = new Date(scheduledAt)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const HH = String(d.getHours()).padStart(2, '0')
  const MM = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}, ${HH}:${MM}`
}

// Calcola i default `{type, severity}` di un nuovo intervento in base
// all'origine. Usata dai form (InterventionRequestModal, futuro CreateModal).
//
// origin === 'report'            → eredita type e severity dal report
// origin === 'maintenance_plan'  → type=preventiva, severity da machine.criticality
// origin === 'manuale'           → default neutri (correttiva, media)
//
// Se il chiamante sa già qualcosa (es. ha solo il report parziale), passa
// l'override esplicito tramite `overrides`.
export function defaultsForOrigin({ origin, report, machine, overrides = {} } = {}) {
  if (origin === 'report' && report) {
    return {
      type: overrides.type || report.type || 'correttiva',
      severity: overrides.severity || report.severity || 'media',
    }
  }
  if (origin === 'maintenance_plan') {
    const sevFromCriticality = machine?.criticality === 'alta'
      ? 'alta'
      : machine?.criticality === 'critica'
        ? 'critica'
        : 'media'
    return {
      type: overrides.type || 'preventiva',
      severity: overrides.severity || sevFromCriticality,
    }
  }
  return {
    type: overrides.type || 'correttiva',
    severity: overrides.severity || 'media',
  }
}

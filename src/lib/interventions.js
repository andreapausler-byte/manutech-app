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

// ─── Quick date chips per form datetime picker ─────────────────────────
// Genera 5 opzioni rapide più "Altra data..." come fallback all'input nativo.
// Ogni chip ha { key, label, value (Date|null) }. value=null per 'custom'
// che apre l'input <datetime-local> sotto i chip.

function round30Up(d) {
  const r = new Date(d)
  const m = r.getMinutes()
  if (m === 0) { r.setSeconds(0, 0); return r }
  if (m <= 30) {
    r.setMinutes(30, 0, 0)
  } else {
    r.setMinutes(0, 0, 0)
    r.setHours(r.getHours() + 1)
  }
  return r
}

// "Oggi 09:00" se sono prima delle 9, altrimenti +1h da now arrotondato a 30'.
function todayAt9OrNextSlot(now = new Date()) {
  const today9 = new Date(now)
  today9.setHours(9, 0, 0, 0)
  if (now.getTime() < today9.getTime()) return today9
  return round30Up(new Date(now.getTime() + 60 * 60 * 1000))
}

function dayPlusN(n, hour = 9) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, 0, 0, 0)
  return d
}

// Prossimo lunedì alle 9. Se oggi è lunedì, ritorna il lunedì successivo
// (skip dell'oggi: l'utente che clicca "Lunedì prossimo" intende quello
// della settimana successiva).
function nextMonday(now = new Date()) {
  const d = new Date(now)
  d.setHours(9, 0, 0, 0)
  const day = d.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
  const daysToAdd = ((1 - day + 7) % 7) || 7
  d.setDate(d.getDate() + daysToAdd)
  return d
}

// Label dinamico per "Oggi": mostra l'ora effettiva se diverso da 09:00,
// così l'utente capisce subito che il chip darà una slot diversa.
function labelToday(now = new Date()) {
  const v = todayAt9OrNextSlot(now)
  const isNine = v.getHours() === 9 && v.getMinutes() === 0
  if (isNine) return 'Oggi 09:00'
  const hh = String(v.getHours()).padStart(2, '0')
  const mm = String(v.getMinutes()).padStart(2, '0')
  return `Oggi ${hh}:${mm}`
}

export function quickDateChips(now = new Date()) {
  return [
    { key: 'today',     label: labelToday(now), value: todayAt9OrNextSlot(now) },
    { key: 'tomorrow',  label: 'Domani 09:00',  value: dayPlusN(1) },
    { key: 'plus3',     label: '+3 giorni',     value: dayPlusN(3) },
    { key: 'nextMon',   label: 'Lunedì prossimo', value: nextMonday(now) },
    { key: 'custom',    label: 'Altra data…',   value: null },
  ]
}

// Converte una Date in stringa "YYYY-MM-DDTHH:MM" (formato richiesto da
// <input type="datetime-local">). Restituisce '' se input invalido.
export function toDatetimeLocalString(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Costruisce la description prefill per un nuovo intervento da report.
// Formato strutturato come da decisions doc §D2.
// Il cursore va posizionato a fine stringa (textarea.setSelectionRange).
export function buildDescriptionPrefill(report) {
  if (!report) return ''
  const t = report.title || ''
  const d = report.description || ''
  return `[Intervento per: ${t}]\n\n${d}\n\n---\nNote pianificazione:\n`
}

// Trasforma le foto del report in items "snapshot" da copiare in
// interventions.media all'apertura del form. Flag `from_report:true` per
// riconoscerle e renderle read-only nell'UI.
export function buildReportPhotoSnapshot(report) {
  if (!report?.media || !Array.isArray(report.media)) return []
  return report.media.map(m => ({
    ...m,
    from_report: true,
    source_report_id: report.id,
  }))
}

// ─── Formatter messaggi di sistema in chat segnalazione ────────────────
// Usati dal DB layer (createInterventionWithReports / updateIntervention)
// per postare automaticamente messaggi di sistema in chat ai report linkati
// con resolves_report=true quando un intervento viene creato o riprogrammato.

// Mapping urgenza UI → label display nel messaggio di chat.
// Andrea: "urgente" come livello tecnico va mostrato come "emergenza".
// Per severity 'critica' (fallback se manca extra_data.urgency) usiamo
// "emergenza" per coerenza con il livello apicale.
export const URGENCY_DISPLAY_MAP = {
  bassa: 'bassa',
  media: 'media',
  alta: 'alta',
  urgente: 'emergenza',
  critica: 'emergenza',
}

function formatDateLong(iso) {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

// Formato compatto per il messaggio di reschedule: anno omesso se uguale
// all'anno corrente, mostrato altrimenti. Default refYear = anno corrente
// del client che renderizza il comment.
function formatDateShort(iso, refYear = new Date().getFullYear()) {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  if (d.getFullYear() === refYear) return `${dd}/${mm}`
  return `${dd}/${mm}/${d.getFullYear()}`
}

// Risolve l'urgenza display da un intervento: priorità a extra_data.urgency
// (campo UI raccolto al create), fallback a severity (modello dati).
function resolveUrgencyDisplay(intervention) {
  const raw = intervention?.extra_data?.urgency || intervention?.severity || 'media'
  return URGENCY_DISPLAY_MAP[raw] || raw
}

// Messaggio chat "creazione intervento pianificato".
// Format: 🔧 Intervento pianificato per DD/MM/YYYY — title — urgenza: X
export function formatPlannedComment(intervention) {
  const dateStr = formatDateLong(intervention?.scheduled_start_at)
  const title = (intervention?.title || 'intervento').trim()
  const urgency = resolveUrgencyDisplay(intervention)
  return `🔧 Intervento pianificato per ${dateStr} — ${title} — urgenza: ${urgency}`
}

// Messaggio chat "riprogrammazione data intervento".
// Format: 📅 Data intervento aggiornata: DD/MM → DD/MM (anno omesso se = ref).
// Se before è null (transizione bozza→pianificato) usa formatPlannedComment
// invece — questa funzione assume entrambe le date valorizzate.
export function formatRescheduledComment(beforeISO, afterISO) {
  const before = formatDateShort(beforeISO)
  const after = formatDateShort(afterISO)
  return `📅 Data intervento aggiornata: ${before} → ${after}`
}

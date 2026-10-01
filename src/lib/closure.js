/**
 * Chiusura di una segnalazione — come è stata risolta.
 *
 * Unica porta di lettura dei dati di chiusura. Tutti i flussi che chiudono
 * (foglio mobile, modal admin, chiusura vocale) scrivono nelle colonne
 * `closure_*` di `reports` (migration 012/019), ma le schede li cercavano
 * in `extra_data.closure_*`, dove nessuno li scrive: il riquadro "Dati
 * chiusura" non compariva mai. Il fallback su `extra_data` resta per i
 * record demo/seed che li tengono lì.
 *
 * Le note aggiunte DOPO la chiusura ("si è ripresentato dopo 3 settimane",
 * il codice esatto del ricambio) vivono in `extra_data.closure_notes`:
 * [{ text, user_id, user_name, created_at }]. Sono la parte che più spesso
 * manca allo storico: chi chiude sa cosa ha fatto, non cosa succederà poi.
 */

import { isTerminalStatus, formatMonthYear } from './constants'

// Un ticket concluso resta tra i "Recenti" per un giorno — conferma visiva
// del lavoro appena fatto — poi scende in archivio.
export const ARCHIVE_WINDOW_HOURS = 24

const pick = (report, key) => {
  const v = report?.[key]
  if (v != null && v !== '') return v
  const x = report?.extra_data?.[key]
  return x != null && x !== '' ? x : null
}

export function getClosure(report) {
  const notes = report?.extra_data?.closure_notes
  return {
    hours: pick(report, 'closure_hours'),
    parts: pick(report, 'closure_parts'),
    rootCause: pick(report, 'closure_root_cause'),
    action: pick(report, 'closure_action'),
    closedAt: report?.closed_at || null,
    notes: Array.isArray(notes) ? notes : [],
  }
}

export const hasClosureData = (c) =>
  c.hours != null || !!c.rootCause || !!c.action || !!c.parts

// "Da completare": manca ciò che serve a chi troverà lo stesso guasto —
// cosa era (causa) e cosa è stato fatto (azione). Ricambi e pezzo no:
// spesso non ci sono davvero. Vale solo per 'risolta': 'chiuso' è per
// definizione un'archiviazione senza intervento.
export function isClosureIncomplete(report) {
  if (report?.status !== 'risolta') return false
  const c = getClosure(report)
  return !c.rootCause || !c.action
}

export const CLOSURE_OUTCOMES = {
  intervento:    { label: 'Risolta',          color: '#10b981' },
  da_completare: { label: 'Da completare',    color: '#f59e0b' },
  senza:         { label: 'Senza intervento', color: '#7d8a9c' },
}

// Esito per filtri ed etichette dell'archivio.
//   'intervento'    → risolta (o chiusa dopo essere stata risolta) con dati
//   'da_completare' → risolta ma senza causa o azione
//   'senza'         → chiusa senza intervento
export function closureOutcome(report) {
  if (isClosureIncomplete(report)) return 'da_completare'
  if (report?.status === 'risolta') return 'intervento'
  return hasClosureData(getClosure(report)) ? 'intervento' : 'senza'
}

// Quando la segnalazione è uscita dal lavoro. `closed_at` lo scrive solo la
// chiusura con intervento; 'chiuso' (archiviazione amministrativa) non lo
// valorizza — e se arriva dopo una risoluzione, il closed_at è quello
// vecchio. Lì vale l'ultimo aggiornamento.
export function closedAtOf(report) {
  if (report?.status !== 'chiuso' && report?.closed_at) return report.closed_at
  return report?.updated_at || report?.created_at || null
}

// Terminale e fuori dalla finestra recente → archivio. Conta la chiusura,
// non `updated_at`: un commento aggiunto dopo (trigger 050) non deve
// riportare tra i "Recenti" un ticket concluso da settimane.
export function isArchivedReport(report, nowMs) {
  if (!isTerminalStatus(report?.status)) return false
  const ts = new Date(closedAtOf(report)).getTime()
  if (!Number.isFinite(ts)) return true
  return nowMs - ts >= ARCHIVE_WINDOW_HOURS * 3600 * 1000
}

// Testo della chiusura per la ricerca client-side: "cuscinetto" deve
// trovare ogni volta che il cuscinetto è stato cambiato, non solo i ticket
// che lo nominano nel titolo.
export function closureSearchText(report) {
  const c = getClosure(report)
  return [c.rootCause, c.action, c.parts, ...c.notes.map(n => n?.text)]
    .filter(Boolean)
    .join(' ')
}

// Chiave mese di chiusura ("2026-09") e relativa etichetta ("Settembre 2026").
export function closureMonthKey(report) {
  const d = new Date(closedAtOf(report))
  if (Number.isNaN(d.getTime())) return 'senza-data'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function closureMonthLabel(key) {
  if (key === 'senza-data') return 'Senza data'
  const [y, m] = key.split('-').map(Number)
  return formatMonthYear(new Date(y, m - 1, 1))
}

// Raggruppa per mese di chiusura, dal più recente.
export function groupByClosureMonth(reports) {
  const sorted = [...reports].sort(
    (a, b) => new Date(closedAtOf(b)) - new Date(closedAtOf(a))
  )
  const groups = []
  for (const r of sorted) {
    const key = closureMonthKey(r)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.list.push(r)
    else groups.push({ key, label: closureMonthLabel(key), list: [r] })
  }
  return groups
}

const clip = (s, n = 60) => {
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

const show = (v) => (v == null || v === '' ? '—' : `«${clip(v)}»`)

// Cosa cambia tra la chiusura salvata e quella corretta, in righe leggibili
// per la cronologia. Niente sparisce in silenzio: la versione precedente
// resta scritta lì.
export function describeClosureChanges(report, next) {
  const prev = getClosure(report)
  const out = []
  const prevHours = prev.hours == null ? null : Number(prev.hours)
  const nextHours = next.closure_hours == null ? null : Number(next.closure_hours)
  if (prevHours !== nextHours) {
    out.push(`Ore: ${prevHours == null ? '—' : `${prevHours}h`} → ${nextHours == null ? '—' : `${nextHours}h`}`)
  }
  const fields = [
    ['rootCause', 'closure_root_cause', 'Causa'],
    ['action', 'closure_action', 'Azione'],
    ['parts', 'closure_parts', 'Ricambi'],
  ]
  for (const [prevKey, nextKey, label] of fields) {
    const a = (prev[prevKey] || '').trim()
    const b = (next[nextKey] || '').trim()
    if (a !== b) out.push(`${label}: ${show(a)} → ${show(b)}`)
  }
  if ((report?.component_id || null) !== (next.component_id || null)) {
    out.push(`Pezzo: ${report?.component_name || 'generico'} → ${next.component_name || 'generico'}`)
  }
  return out
}

export function newClosureNote(user, text) {
  return {
    text: text.trim(),
    user_id: user?.id || null,
    user_name: user?.name || 'Utente',
    created_at: new Date().toISOString(),
  }
}

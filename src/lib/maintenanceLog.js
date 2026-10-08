/**
 * Un intervento registrato (`maintenance_logs`), letto dal lato "cosa è
 * stato fatto" — come `lib/closure.js` per le segnalazioni concluse.
 *
 * Note aggiunte dopo e cronologia delle correzioni vivono in `extra_data`
 * (migration 068):
 *   notes:   [{ text, user_id, user_name, created_at }]
 *   history: [{ detail, user_id, user_name, created_at }]
 * Senza la 068 la colonna non c'è: si legge vuoto, e chi scrive lo scopre
 * dalla riga riletta (vedi `db.correctMaintenanceLog`).
 *
 * Gli allegati restano in `media` e si leggono con `lib/logMedia.js`.
 */

import { formatDate } from './constants'
import { isPdfMedia } from './logMedia'

export const LOG_TYPES = {
  programmata:   { label: 'Programmata',   color: '#8b5cf6' },
  straordinaria: { label: 'Straordinaria', color: '#f59e0b' },
}

export const logTypeMeta = (log) =>
  log?.type === 'programmata' ? LOG_TYPES.programmata : LOG_TYPES.straordinaria

export function getLogRecord(log) {
  const extra = log?.extra_data || {}
  return {
    notes: Array.isArray(extra.notes) ? extra.notes : [],
    history: Array.isArray(extra.history) ? extra.history : [],
  }
}

// Aggiornano tecnici e admin, come per le chiusure delle segnalazioni: è
// anche ciò che la policy `mlogs_update` (migration 020) permette.
export const canEditLog = (user) => user?.role === 'tecnico' || user?.role === 'admin'

// Toglie un allegato chi l'ha aggiunto, o un admin. Gli allegati messi
// registrando non hanno autore: sono di chi ha registrato l'intervento.
export function canRemoveLogMedia(item, log, user) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (item?.user_id) return item.user_id === user.id
  return !!log?.performed_by && log.performed_by === user.id
}

const stamp = (user) => ({
  user_id: user?.id || null,
  user_name: user?.name || 'Utente',
  created_at: new Date().toISOString(),
})

export const newLogNote = (user, text) => ({ text: text.trim(), ...stamp(user) })

export const newLogEntry = (user, detail) => ({ detail, ...stamp(user) })

// Gli allegati aggiunti dopo dicono chi li ha messi e quando: serve a
// sapere chi può toglierli, e a leggere la cronologia.
export const stampLogMedia = (user, items) => (items || []).map(m => ({ ...m, ...stamp(user) }))

export const formatMinutes = (m) => {
  const n = Number(m)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60)
  const rest = n % 60
  return rest ? `${h}h ${rest}min` : `${h}h`
}

// Valore per <input type="datetime-local"> nell'ora locale.
export function toLocalDatetimeInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const clip = (s, n = 60) => {
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

const show = (v) => (v == null || v === '' ? '—' : `«${clip(v)}»`)

const sameInstant = (a, b) => {
  if (!a && !b) return true
  if (!a || !b) return false
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60 * 1000
}

// Cosa cambia tra l'intervento salvato e quello corretto, in righe per la
// cronologia. Si guarda solo ai campi presenti in `next`: chi corregge la
// durata non deve trovarsi in cronologia "Ditta: — → —".
export function describeLogChanges(log, next, { componentName } = {}) {
  const out = []
  const text = [
    ['title', 'Titolo'],
    ['description', 'Cosa è stato fatto'],
    ['parts_replaced', 'Ricambi'],
    ['contractor_name', 'Ditta'],
    ['contractor_reference', 'Rif.'],
  ]
  for (const [key, label] of text) {
    if (!(key in next)) continue
    const a = (log?.[key] || '').trim()
    const b = (next[key] || '').trim()
    if (a !== b) out.push(`${label}: ${show(a)} → ${show(b)}`)
  }
  if ('duration_minutes' in next) {
    const a = log?.duration_minutes ?? null
    const b = next.duration_minutes ?? null
    if (Number(a) !== Number(b) && !(a == null && b == null)) {
      out.push(`Durata: ${formatMinutes(a) || '—'} → ${formatMinutes(b) || '—'}`)
    }
  }
  if ('performed_at' in next && !sameInstant(log?.performed_at, next.performed_at)) {
    out.push(`Data: ${formatDate(log?.performed_at) || '—'} → ${formatDate(next.performed_at) || '—'}`)
  }
  if ('is_external' in next && !!log?.is_external !== !!next.is_external) {
    out.push(next.is_external ? 'Segnato come intervento di ditta esterna' : 'Non più intervento di ditta esterna')
  }
  if ('component_id' in next && (log?.component_id || null) !== (next.component_id || null)) {
    out.push(`Pezzo: ${log?.component?.name || 'intero macchinario'} → ${componentName || 'intero macchinario'}`)
  }
  if ('media' in next) {
    const before = new Set((log?.media || []).map(m => m?.url))
    const after = new Set((next.media || []).map(m => m?.url))
    const added = (next.media || []).filter(m => m?.url && !before.has(m.url))
    const removed = (log?.media || []).filter(m => m?.url && !after.has(m.url))
    if (added.length) out.push(`Allegati aggiunti: ${describeLogMedia(added)}`)
    if (removed.length) out.push(`Allegati tolti: ${describeLogMedia(removed)}`)
  }
  return out
}

// «foglio-ditta.pdf, 2 foto»: i nomi dei PDF dicono qualcosa, quelli delle
// foto del telefono (IMG_2034.jpg) no.
export function describeLogMedia(items) {
  const pdfs = items.filter(isPdfMedia).map(m => clip(m.name || 'documento', 40))
  const photos = items.length - pdfs.length
  return [...pdfs, photos > 0 && (photos === 1 ? '1 foto' : `${photos} foto`)].filter(Boolean).join(', ')
}

export const clipNote = (text) => clip(text, 80)

// Testo per la ricerca: chi cerca "cinghia" deve trovare l'intervento anche
// se la cinghia è nominata solo nei ricambi o in una nota aggiunta dopo.
export function logSearchText(log) {
  const { notes } = getLogRecord(log)
  return [
    log?.title, log?.description, log?.parts_replaced, log?.performed_by_name,
    log?.contractor_name, log?.contractor_reference,
    log?.machine?.name, log?.component?.name,
    ...notes.map(n => n?.text),
    ...(log?.media || []).map(m => m?.name),
  ].filter(Boolean).join(' ').toLowerCase()
}

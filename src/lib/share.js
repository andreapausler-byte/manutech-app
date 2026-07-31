// Condivisione verso WhatsApp/clipboard di segnalazioni e chat.
// I testi sono composti in italiano con i label di constants.js.
// Tre canali di uscita, scelti dal chiamante:
//   - openWhatsApp(text)  → wa.me (o scheme whatsapp:// da PWA installata
//     su iOS, dove wa.me apre una pagina intermedia invece dell'app)
//   - nativeShare({...})  → navigator.share (share sheet di sistema)
//   - copyText(text)      → clipboard

import { STATUS, SEVERITY, REPORT_TYPES, formatDate, formatTicketId } from './constants'

const ROLE_LABELS = { admin: 'Admin', tecnico: 'Tecnico', operatore: 'Operatore', guest: 'Ospite' }

// Oltre questa soglia di caratteri encoded il link wa.me rischia il
// troncamento (limite pratico URL/intent Android ~2000 caratteri):
// si ripiega sulla copia in clipboard.
const WA_TEXT_LIMIT = 1800
const DESCRIPTION_LIMIT = 600
const PHOTO_LINKS_LIMIT = 3

// In demo mode i media sono data-URL base64: non condivisibili fuori dall'app.
const isShareableUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url)

export const reportAppLink = (report) => `${window.location.origin}/reports/${report.id}`
export const guestChatLink = (reportId, token) => `${window.location.origin}/guest/${reportId}/${token}`

// ── Composizione testi ───────────────────────────────────

// Riepilogo testuale della segnalazione, pronto da incollare in una chat.
// `url` è il link di coda; con `guest: true` la call-to-action spiega che
// non serve login (link ospite), altrimenti punta all'app.
export function buildReportSummary(report, { url, guest = false } = {}) {
  const lines = []
  const tk = formatTicketId(report)
  lines.push(`🔧 ${tk ? `${tk} — ` : ''}${report.title}`)

  const meta = []
  if (report.machine) meta.push(`Macchina: ${report.machine}`)
  const sev = SEVERITY[report.severity]
  if (sev) meta.push(`Gravità: ${sev.label}`)
  const st = STATUS[report.status]
  if (st) meta.push(`Stato: ${st.label}`)
  if (meta.length) lines.push(meta.join(' · '))

  const type = REPORT_TYPES[report.type]
  if (type) lines.push(`Tipo: ${type.label}`)

  const assignee = report.assigned_to_user?.name || report.assigned_to_name
  if (assignee) lines.push(`Assegnata a: ${assignee}`)

  const author = report.created_by_user?.name || report.created_by_name
  const created = formatDate(report.created_at)
  if (author || created) {
    lines.push(`Segnalata${author ? ` da ${author}` : ''}${created ? ` · ${created}` : ''}`)
  }

  const description = (report.description || '').trim()
  if (description) {
    lines.push('')
    lines.push(description.length > DESCRIPTION_LIMIT
      ? `${description.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`
      : description)
  }

  const photoUrls = (report.media || [])
    .filter(m => m?.type === 'photo' && isShareableUrl(m.url))
    .map(m => m.url)
  if (photoUrls.length) {
    lines.push('')
    photoUrls.slice(0, PHOTO_LINKS_LIMIT).forEach(u => lines.push(`📷 ${u}`))
    if (photoUrls.length > PHOTO_LINKS_LIMIT) {
      lines.push(`(+${photoUrls.length - PHOTO_LINKS_LIMIT} altre foto)`)
    }
  }

  if (url) {
    lines.push('')
    lines.push(guest ? '👉 Segui e rispondi (senza login):' : '👉 Apri in ManuTech:')
    lines.push(url)
  }

  return lines.join('\n')
}

// Trascrizione testuale della chat di una segnalazione. I commenti vocali
// entrano col testo trascritto (già in comments.text); i media compaiono
// come link solo se puntano a URL pubblici.
export function buildChatTranscript(report, comments, { url, guest = false } = {}) {
  const tk = formatTicketId(report)
  const lines = [`💬 Chat ${tk ? `${tk} — ` : ''}${report.title}`, '']

  const MEDIA_ICONS = { photo: '📷', video: '🎬', audio: '🎙️' }
  for (const c of comments || []) {
    if (c.deleted_at) continue
    const who = c.user_name || 'Utente'
    const role = ROLE_LABELS[c.user_role] || c.user_role
    const text = (c.text || '').trim()
    lines.push(`[${formatDate(c.created_at)}] ${who}${role ? ` (${role})` : ''}: ${text}`)
    for (const m of c.media || []) {
      if (!isShareableUrl(m?.url)) continue
      lines.push(`${MEDIA_ICONS[m.type] || '📎'} ${m.url}`)
    }
  }

  if (url) {
    lines.push('')
    lines.push(guest ? '👉 Continua la conversazione (senza login):' : '👉 Apri in ManuTech:')
    lines.push(url)
  }

  return lines.join('\n')
}

// ── Canali di uscita ─────────────────────────────────────

export const canNativeShare = () => typeof navigator !== 'undefined' && !!navigator.share

// Esiti: 'shared' | 'aborted' (annullato dall'utente) | 'failed' | 'unsupported'
export async function nativeShare({ title, text }) {
  if (!canNativeShare()) return 'unsupported'
  try {
    await navigator.share({ title, text })
    return 'shared'
  } catch (err) {
    return err?.name === 'AbortError' ? 'aborted' : 'failed'
  }
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text)
}

const isIosStandalonePwa = () => {
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true
  // iPadOS si presenta come 'Macintosh': il touch lo distingue da un Mac
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  return standalone && ios
}

// Esiti: 'opened' | 'copied' (testo oltre soglia wa.me, o popup bloccato
// dal browser → clipboard)
export async function openWhatsApp(text) {
  const encoded = encodeURIComponent(text)
  if (encoded.length > WA_TEXT_LIMIT) {
    await copyText(text)
    return 'copied'
  }
  if (isIosStandalonePwa()) {
    window.location.href = `whatsapp://send?text=${encoded}`
    return 'opened'
  }
  const win = window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer')
  if (!win) {
    await copyText(text)
    return 'copied'
  }
  return 'opened'
}

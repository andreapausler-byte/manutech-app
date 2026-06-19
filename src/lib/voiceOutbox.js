/**
 * voiceOutbox.js — Persistenza durevole + consegna dell'audio vocale.
 *
 * Contratto (deciso con il founder): **l'audio grezzo è la fonte di verità**.
 * Dal momento in cui la registrazione si ferma, il Blob vive su IndexedDB
 * (via `outbox.js`) e NON va perso in nessun caso — offline, app chiusa in
 * tasca, refresh, riavvio — tranne che per eliminazione esplicita dell'utente.
 * La trascrizione è una comodità best-effort, separata e ritentabile.
 *
 * Consegna unificata (`flushVoiceItem`): un'unica pipeline idempotente per
 * tutti i flow (operatore + tecnico). Stadi tracciati sul record così un
 * retry non duplica nulla:
 *   1. crea il ticket (solo flow "nuovo ticket", se non esiste ancora)
 *   2. applica l'update al report (cambio stato / dati chiusura)
 *   3. trascrive (solo se manca testo e siamo online) — best-effort
 *   4. carica l'audio su Storage (bucket `attachments`)
 *   5. scrive la riga di collegamento audio→ticket: un commento con
 *      media:[{type:'audio',url}] via `db.addComment` (org_id risolto da
 *      `get_my_org_id()`, mai 'default')
 *   6. a consegna completata, purga il record (e quindi il Blob)
 *
 * La stessa pipeline gira in primo piano al submit (online) e in background
 * dal sync worker (al ritorno della rete). In nessun ramo l'audio viene
 * cancellato se la consegna fallisce: il record resta `failed`/`pending`.
 */

import { db, isSupabaseConfigured } from './supabase'
import {
  outboxPut, outboxGet, outboxAll, outboxDelete, isOutboxAvailable,
} from './outbox'
import { requestTranscription, applyCorrections } from './transcription'

const VOICE_TYPE = 'voice'

const KIND_BY_CONTEXT = {
  operator_new_ticket: 'voice_new_ticket',
  tech_new_ticket: 'voice_new_ticket',
  tech_update: 'voice_update',
  tech_close: 'voice_close',
  tech_note: 'voice_note',
}

const NEW_TICKET_CONTEXTS = new Set(['operator_new_ticket', 'tech_new_ticket'])

const DEFAULT_TEXT = {
  voice_note: 'Nota vocale',
  voice_update: 'Aggiornamento vocale',
  voice_close: 'Chiusura vocale',
  voice_new_ticket: 'Ticket vocale',
}

export const VOICE_CONTEXT_LABEL = {
  operator_new_ticket: 'Nuovo ticket',
  tech_new_ticket: 'Nuovo ticket',
  tech_update: 'Aggiornamento',
  tech_close: 'Chiusura',
  tech_note: 'Nota',
}

function uid() {
  return 'vo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function audioExt(mimeType) {
  const mt = mimeType || ''
  if (mt.includes('ogg')) return 'ogg'
  if (mt.includes('mp4')) return 'mp4'
  return 'webm'
}

/**
 * buildVoiceItem — costruisce il record (senza persisterlo). Usato da
 * enqueueVoiceCapture e come fallback in-memory quando IndexedDB non è
 * disponibile (es. browser in modalità privata).
 */
export function buildVoiceItem({
  blob, mimeType, durationMs = 0, context, reportId = null, user,
  text = '', transcription = '', transcriptionStatus = 'pending',
  extraData = {}, media = [], reportPayload = null, reportUpdate = null,
  confidence = null,
}) {
  const now = Date.now()
  return {
    id: uid(),
    type: VOICE_TYPE,
    status: 'pending',
    retries: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    // audio
    blob,
    mimeType: mimeType || blob?.type || 'audio/webm',
    durationMs,
    // contesto
    context,
    kind: KIND_BY_CONTEXT[context] || 'voice_note',
    needsTicket: NEW_TICKET_CONTEXTS.has(context),
    reportId,
    // utente
    userId: user?.id || null,
    userName: user?.name || null,
    userRole: user?.role || null,
    // contenuto (arricchito al submit)
    text,
    transcription,
    transcriptionStatus,
    extraData,
    media,
    reportPayload,
    reportUpdate,
    reportUpdateApplied: false,
    confidence,
    // stadi consegna
    audioUrl: null,
    commentId: null,
  }
}

/** Persiste un nuovo item all'arresto della registrazione. */
export async function enqueueVoiceCapture(params) {
  const item = buildVoiceItem(params)
  if (!isOutboxAvailable()) {
    // Nessuna persistenza possibile: ritorna comunque l'item così il
    // chiamante può consegnarlo in-memory (degrado controllato).
    return { id: null, item }
  }
  try {
    await outboxPut(item)
    return { id: item.id, item }
  } catch (err) {
    console.warn('[voiceOutbox] enqueue fallito:', err?.message)
    return { id: null, item }
  }
}

export async function enrichVoiceItem(id, patch) {
  if (!id) return null
  const item = await outboxGet(id)
  if (!item) return null
  const next = { ...item, ...patch, updatedAt: Date.now() }
  await outboxPut(next)
  return next
}

export async function removeVoiceItem(id) {
  if (!id) return
  await outboxDelete(id)
}

export async function getVoiceItems() {
  const all = await outboxAll()
  return all.filter((i) => i?.type === VOICE_TYPE)
}

class NeedsInputError extends Error {
  constructor() {
    super('NEEDS_INPUT')
    this.code = 'NEEDS_INPUT'
  }
}

// Lock in-memory dei delivery in corso (per-id), per sessione.
const _inFlight = new Set()

/**
 * flushVoiceItem — consegna idempotente di un singolo item.
 * Accetta l'id (lo carica) o un item già in memoria (fallback senza IDB).
 * Ritorna { reportId, report, commentId } a consegna completata; lancia se
 * la consegna fallisce (l'item resta in coda, mai cancellato).
 */
export async function flushVoiceItem(itemOrId) {
  let item = typeof itemOrId === 'string' ? await outboxGet(itemOrId) : itemOrId
  if (!item) return null
  // Lock per-id: evita che submit in primo piano e sync in background
  // consegnino lo stesso item insieme (rischio ticket duplicato).
  if (item.id && _inFlight.has(item.id)) return null
  if (item.id) _inFlight.add(item.id)

  const persisted = !!item.id && isOutboxAvailable()

  // save: aggiorna lo stato locale e (best-effort) lo persiste. Se IndexedDB
  // non è scrivibile, prosegue comunque: la consegna online va completata.
  const save = async (patch) => {
    item = { ...item, ...patch, updatedAt: Date.now() }
    if (persisted) {
      try { await outboxPut(item) } catch (e) { console.warn('[voiceOutbox] persist:', e?.message) }
    }
  }

  await save({ status: 'uploading', lastError: null })

  try {
    // 1. Ticket (solo flow "nuovo ticket")
    let createdReport = null
    if (!item.reportId) {
      if (!item.needsTicket) throw new Error('reportId mancante per item non-new-ticket')
      const title = item.reportPayload?.title?.trim()
      if (!title) {
        await save({ status: 'needs_input' })
        throw new NeedsInputError()
      }
      createdReport = await db.createReport({ ...item.reportPayload })
      await save({ reportId: createdReport.id })
    }

    // 2. Update al report (cambio stato / chiusura), una sola volta
    if (item.reportUpdate && !item.reportUpdateApplied) {
      await db.updateReport(item.reportId, item.reportUpdate)
      await save({ reportUpdateApplied: true })
    }

    // 3. Trascrizione differita (best-effort): solo se manca testo e online
    let transcription = item.transcription
    if (
      isSupabaseConfigured() &&
      typeof navigator !== 'undefined' && navigator.onLine !== false &&
      item.transcriptionStatus !== 'done' &&
      !(item.text && item.text.trim()) &&
      !(transcription && transcription.trim())
    ) {
      try {
        const raw = await requestTranscription({ blob: item.blob, mimeType: item.mimeType, vocabulary: '' })
        transcription = applyCorrections(raw)
        await save({ transcription, transcriptionStatus: 'done' })
      } catch {
        await save({ transcriptionStatus: 'failed' })
      }
    }

    // 4. Upload audio binario su Storage
    let audioUrl = item.audioUrl
    if (!audioUrl) {
      audioUrl = await db.uploadVoiceAudio(item.blob, item.reportId, item.userId)
      await save({ audioUrl })
    }

    // 5. Riga di collegamento audio→ticket (commento con media audio)
    if (!item.commentId) {
      const finalText = (item.text && item.text.trim())
        || (transcription && transcription.trim())
        || DEFAULT_TEXT[item.kind] || 'Nota vocale'
      const audioMedia = {
        type: 'audio',
        url: audioUrl,
        name: `${item.kind}.${audioExt(item.mimeType)}`,
      }
      const media = [...(Array.isArray(item.media) ? item.media : []), audioMedia]
      const comment = await db.addComment(item.reportId, {
        text: finalText,
        user_id: item.userId,
        user_name: item.userName,
        user_role: item.userRole,
        kind: item.kind,
        extra_data: { ...(item.extraData || {}), transcription: transcription || null },
        confidence: item.confidence ?? null,
        media,
      })
      await save({ commentId: comment?.id || 'done' })
    }

    // 6. Consegna completata → purga record + Blob
    if (persisted) await removeVoiceItem(item.id)
    return { reportId: item.reportId, report: createdReport, commentId: item.commentId }
  } catch (err) {
    if (err instanceof NeedsInputError) throw err
    await save({ status: 'failed', retries: (item.retries || 0) + 1, lastError: err?.message || 'Errore invio' })
    throw err
  } finally {
    if (item.id) _inFlight.delete(item.id)
  }
}

/**
 * submitVoice — punto d'ingresso unico dei flow al momento del submit.
 * Arricchisce l'item durevole (se esiste) e ne tenta la consegna; in assenza
 * di item persistito (IDB non disponibile) consegna una copia in-memory.
 */
export async function submitVoice({
  outboxId, blob, context, reportId, user,
  text, extraData, media, reportPayload, reportUpdate, confidence,
}) {
  const patch = {
    ...(text != null ? { text } : {}),
    ...(extraData != null ? { extraData } : {}),
    ...(media != null ? { media } : {}),
    ...(reportPayload != null ? { reportPayload } : {}),
    ...(reportUpdate != null ? { reportUpdate } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  }
  if (outboxId) {
    const enriched = await enrichVoiceItem(outboxId, patch)
    if (enriched) return flushVoiceItem(enriched)
    // item sparito (raro): cade nel fallback in-memory sotto.
  }
  // Fallback senza item durevole: consegna in-memory dal blob fornito.
  const transient = buildVoiceItem({ blob, context, reportId, user, ...patch })
  return flushVoiceItem(transient)
}

// ─── Sync worker (singleton, evita run concorrenti) ───
let _flushing = false

export async function flushVoiceOutbox() {
  if (_flushing) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  if (!isOutboxAvailable()) return
  _flushing = true
  try {
    const items = await getVoiceItems()
    for (const item of items) {
      if (item.status === 'needs_input') continue
      try {
        await flushVoiceItem(item)
      } catch {
        // resta in coda, si ritenta al prossimo giro
      }
    }
  } finally {
    _flushing = false
  }
}

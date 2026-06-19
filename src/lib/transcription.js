/**
 * transcription.js — Helper condivisi per la trascrizione vocale (Whisper).
 *
 * Estratti da `useVoiceCapture` per essere riusati anche dal sync offline
 * (`voiceOutbox.flushVoiceItem`): la stessa logica di vocabolario, correzioni
 * note e detection di hallucination vale sia per la trascrizione "live" in
 * review sia per quella differita al ritorno della rete.
 *
 * La edge function `transcribe` accetta il blob inline (multipart/form-data)
 * ed è idempotente e senza side-effect: si può ritentare quante volte serve.
 */

import { supabase } from './supabase'

export const TRANSCRIPTION_TIMEOUT_MS = 15000
export const MIN_AUDIO_BYTES = 5000
export const MIN_AUDIO_MS = 1500     // sotto 1.5s consideriamo l'audio non utile
export const MAX_VOCAB_CHARS = 800

// Detection di Whisper hallucination su silenzio o rumore. Il modello a volte
// inventa parole random in altre lingue ("Brandi naivowi, Nordili Rock
// Теперь...") quando l'audio non contiene voce comprensibile. Heuristic:
// - Caratteri non latini (cirillico, asiatico, ecc.) -> hallucination quasi certa
// - Tante parole MAIUSCOLE corte (sigle inventate tipo "ABplS, CBT15") -> sospetto
export function looksLikeHallucination(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.trim()
  if (t.length < 10) return false  // troppo corto per giudicare
  // Caratteri non latini (cirillico, kanji, ecc.)
  if (/[Ѐ-ӿ֐-׿؀-ۿ぀-ヿ一-鿿]/.test(t)) {
    return true
  }
  // Sigle MAIUSCOLE/MISTE corte separate da virgole tipo "ABplS, CBT15, HVB"
  const tokens = t.split(/[\s,.-]+/).filter(Boolean)
  if (tokens.length >= 6) {
    const acronymish = tokens.filter(w =>
      w.length >= 3 && w.length <= 8 &&
      /[A-Z]/.test(w) && /[a-z0-9]/.test(w) &&
      !/^[A-Z][a-z]+$/.test(w)  // escludi capitalizzazione normale
    )
    if (acronymish.length / tokens.length > 0.35) return true
  }
  return false
}

// Vocabolario tecnico statico per il dominio manutenzione industriale
// (settore birrificio / linea imbottigliamento). Whisper accetta ~244 token
// come prompt: questo va concatenato ai nomi macchine reali, totale tronco
// a 800 caratteri.
const STATIC_VOCAB_TECH = [
  'Trascrizione di un tecnico/operatore di manutenzione di birrificio.',
  'Macchine tipo: imbottigliatrice, riempitrice, tappatrice, etichettatrice, sciacquatrice, depalettizzatore, palettizzatore, capsulatrice, pasteurizzatrice tunnel.',
  'Componenti: valvola DN65, pistoncino, guarnizione OR, cuscinetto, encoder, sonda PT100, elettrovalvola, attuatore, premitreccia, rubinetto, ugello.',
  // Ripeti i brand "difficili" per Whisper (K iniziale viene italianizzata in C).
  'Brand: Kosme, Kosme, Kosme, GAI, Bertolaso, Sidel, KHS, Krones, Comac, GEA, Cimaer, Bardi, BBM, SKF, Festo, SMC, Burkert, Endress, Siemens.',
  'Termini: smontaggio, lubrificazione, sostituzione, taratura, calibrazione, lappatura, service line.',
].join(' ')

// Correzioni post-trascrizione per pattern noti di Whisper italiano.
const TRANSCRIPTION_CORRECTIONS = [
  { pattern: /\b[ck]osm[ei]\b/gi, replacement: 'Kosme' },
  { pattern: /\bcogna\b/gi, replacement: 'Kosme' },
  { pattern: /\bimbo[bv][ie]l[ie]atric[ei]\b/gi, replacement: 'imbottigliatrice' },
]

export function applyCorrections(text) {
  if (!text) return text
  let corrected = text
  for (const { pattern, replacement } of TRANSCRIPTION_CORRECTIONS) {
    corrected = corrected.replace(pattern, replacement)
  }
  return corrected
}

export function buildVocabulary(machines, vocabularyHints) {
  const parts = [STATIC_VOCAB_TECH]
  if (Array.isArray(machines) && machines.length > 0) {
    const names = machines
      .map(m => m?.name)
      .filter(Boolean)
      .slice(0, 30) // hard cap per evitare overflow
      .join(', ')
    if (names) parts.push(`Macchine: ${names}.`)
  }
  if (Array.isArray(vocabularyHints) && vocabularyHints.length > 0) {
    parts.push(vocabularyHints.filter(Boolean).join(' '))
  }
  return parts.join(' ').slice(0, MAX_VOCAB_CHARS)
}

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ])
}

/**
 * requestTranscription — invoca la edge function `transcribe` con il blob
 * audio inline e ritorna il testo grezzo (trim). Lancia in caso di errore o
 * timeout: il chiamante decide se è bloccante (mai, per design) o ritentabile.
 */
export async function requestTranscription({ blob, mimeType, vocabulary }) {
  const form = new FormData()
  const mt = mimeType || blob?.type || ''
  const ext = mt.includes('ogg') ? 'ogg' : mt.includes('mp4') ? 'mp4' : 'webm'
  form.append('audio', blob, `recording.${ext}`)
  if (vocabulary) form.append('vocabulary', vocabulary)
  const resp = await withTimeout(
    supabase.functions.invoke('transcribe', { body: form }),
    TRANSCRIPTION_TIMEOUT_MS,
    'trascrizione',
  )
  if (resp.error) throw resp.error
  return (resp.data?.text || '').toString().trim()
}

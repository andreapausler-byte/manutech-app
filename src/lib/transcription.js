/**
 * transcription.js — Helper condivisi per la trascrizione vocale
 * (ElevenLabs Scribe v2, con Groq Whisper come ripiego: vedi la edge
 * function `transcribe`).
 *
 * Estratti da `useVoiceCapture` per essere riusati anche dal sync offline
 * (`voiceOutbox.flushVoiceItem`): la stessa logica di vocabolario, correzioni
 * note e detection di hallucination vale sia per la trascrizione "live" in
 * review sia per quella differita al ritorno della rete.
 *
 * La edge function `transcribe` accetta il blob inline (multipart/form-data)
 * ed è idempotente e senza side-effect: si può ritentare quante volte serve.
 */

import { supabase, db } from './supabase'

// Copre Scribe (che la edge function abbandona dopo 10s) più il ripiego su
// Whisper. Vale anche per l'estrazione dei campi in useVoiceCapture.
export const TRANSCRIPTION_TIMEOUT_MS = 25000
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
// (settore birrificio / linea imbottigliamento). Serve a entrambi i motori:
// a Scribe come termini singoli (buildKeyterms), a Whisper come prosa
// (STATIC_VOCAB_TECH, max ~244 token insieme ai nomi macchine).
const VOCAB_MACHINE_TYPES = [
  'imbottigliatrice', 'riempitrice', 'tappatrice', 'etichettatrice', 'sciacquatrice',
  'depalettizzatore', 'palettizzatore', 'capsulatrice', 'pasteurizzatrice tunnel',
]
const VOCAB_COMPONENTS = [
  'valvola DN65', 'pistoncino', 'guarnizione OR', 'cuscinetto', 'encoder', 'sonda PT100',
  'elettrovalvola', 'attuatore', 'premitreccia', 'rubinetto', 'ugello',
]
const VOCAB_BRANDS = [
  'Kosme', 'GAI', 'Bertolaso', 'Sidel', 'KHS', 'Krones', 'Comac', 'GEA', 'Cimaer', 'Bardi',
  'BBM', 'SKF', 'Festo', 'SMC', 'Burkert', 'Endress', 'Siemens',
]
const VOCAB_TERMS = [
  'smontaggio', 'lubrificazione', 'sostituzione', 'taratura', 'calibrazione', 'lappatura',
  'service line',
]
const STATIC_VOCAB_TECH = [
  'Trascrizione di un tecnico/operatore di manutenzione di birrificio.',
  `Macchine tipo: ${VOCAB_MACHINE_TYPES.join(', ')}.`,
  `Componenti: ${VOCAB_COMPONENTS.join(', ')}.`,
  // Ripeti i brand "difficili" per Whisper (K iniziale viene italianizzata in C).
  `Brand: Kosme, Kosme, ${VOCAB_BRANDS.join(', ')}.`,
  `Termini: ${VOCAB_TERMS.join(', ')}.`,
].join(' ')

// Scribe accetta fino a 1000 termini (la edge function scarta quelli oltre
// 49 caratteri o 5 parole).
const MAX_KEYTERMS = 1000
// I componenti cambiano di rado: una lettura ogni 10 minuti basta.
const COMPONENT_TERMS_TTL_MS = 10 * 60 * 1000
let componentTermsCache = { terms: null, ts: 0 }

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

/**
 * buildKeyterms — i termini che Scribe deve riconoscere. Prima quelli reali
 * dello stabilimento (macchine con marca e modello, componenti, hint del
 * contesto), poi il vocabolario fisso: oltre il tetto cade il generico.
 */
export function buildKeyterms(machines, componentTerms, vocabularyHints) {
  const candidates = [
    ...(Array.isArray(machines) ? machines : []).flatMap(m => [m?.name, m?.manufacturer, m?.model]),
    ...(Array.isArray(componentTerms) ? componentTerms : []),
    ...(Array.isArray(vocabularyHints) ? vocabularyHints : []),
    ...VOCAB_MACHINE_TYPES, ...VOCAB_COMPONENTS, ...VOCAB_BRANDS, ...VOCAB_TERMS,
  ]
  const seen = new Set()
  const terms = []
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const term = c.replace(/\s+/g, ' ').trim()
    const key = term.toLowerCase()
    if (!term || seen.has(key)) continue
    seen.add(key)
    terms.push(term)
    if (terms.length >= MAX_KEYTERMS) break
  }
  return terms
}

async function loadComponentTerms() {
  if (componentTermsCache.terms && Date.now() - componentTermsCache.ts < COMPONENT_TERMS_TTL_MS) {
    return componentTermsCache.terms
  }
  try {
    const terms = await db.getComponentVocabulary()
    componentTermsCache = { terms, ts: Date.now() }
    return terms
  } catch (e) {
    console.warn('[transcription] component vocabulary failed:', e?.message)
    return []
  }
}

/**
 * prepareTranscriptionHints — gli aiuti per entrambi i motori in un colpo:
 * `vocabulary` (prosa per Whisper) e `keyterms` (lista per Scribe).
 */
export async function prepareTranscriptionHints(machines, vocabularyHints) {
  const componentTerms = await loadComponentTerms()
  return {
    vocabulary: buildVocabulary(machines, vocabularyHints),
    keyterms: buildKeyterms(machines, componentTerms, vocabularyHints),
  }
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
export async function requestTranscription({ blob, mimeType, vocabulary, keyterms }) {
  const form = new FormData()
  const mt = mimeType || blob?.type || ''
  const ext = mt.includes('ogg') ? 'ogg' : mt.includes('mp4') ? 'mp4' : 'webm'
  form.append('audio', blob, `recording.${ext}`)
  if (vocabulary) form.append('vocabulary', vocabulary)
  if (Array.isArray(keyterms) && keyterms.length > 0) form.append('keyterms', JSON.stringify(keyterms))
  const resp = await withTimeout(
    supabase.functions.invoke('transcribe', { body: form }),
    TRANSCRIPTION_TIMEOUT_MS,
    'trascrizione',
  )
  if (resp.error) throw resp.error
  return (resp.data?.text || '').toString().trim()
}

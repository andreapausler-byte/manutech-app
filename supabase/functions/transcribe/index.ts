/**
 * Edge Function: transcribe
 *
 * Trascrive un file audio (webm/ogg/mp4/m4a/wav) in testo italiano.
 *
 * Motore principale: ElevenLabs Scribe v2 (dal 1/10/2026). Il più preciso
 * nelle classifiche indipendenti e, soprattutto, accetta fino a 1000
 * `keyterms`: tutte le macchine, i componenti e i marchi dello stabilimento,
 * che erano proprio le parole che Whisper sbagliava (vedi le correzioni a
 * mano in src/lib/transcription.js).
 *
 * Ripiego: Groq Whisper large-v3, se ELEVENLABS_API_KEY non è configurata o
 * se Scribe fallisce o non risponde in tempo. Whisper riceve solo il
 * `vocabulary` (max ~244 token).
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   ELEVENLABS_API_KEY — chiave API ElevenLabs (facoltativa: senza, solo Groq)
 *   GROQ_API_KEY       — chiave API Groq (gsk_...), per il ripiego
 *
 * Body: multipart/form-data con:
 *   audio       — Blob audio (obbligatorio)
 *   keyterms    — string opzionale, JSON array di termini per Scribe
 *                 (nomi macchine, componenti, marchi, termini tecnici)
 *   vocabulary  — string opzionale, hint in prosa per Whisper. Tronchiamo a
 *                 800 caratteri per sicurezza.
 *
 * Response:
 *   { text: string, engine: 'scribe_v2' | 'whisper-large-v3' } oppure { error: string }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/speech-to-text'
const SCRIBE_MODEL = 'scribe_v2'
// Oltre questo tempo si passa a Whisper: il client aspetta al massimo 25s
// in tutto (TRANSCRIPTION_TIMEOUT_MS) e deve restare tempo per il ripiego.
const SCRIBE_TIMEOUT_MS = 10000
// Limiti di Scribe: max 1000 termini, ciascuno sotto i 50 caratteri e con
// al massimo 5 parole. Un termine fuori limite farebbe rifiutare la
// richiesta, quindi si filtrano qui.
const MAX_KEYTERMS = 1000
const MAX_KEYTERM_CHARS = 49
const MAX_KEYTERM_WORDS = 5

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
// large-v3 e non turbo: un po' più lento, ma sbaglia meno (WER ~10% contro
// ~12%). È il ripiego, la precisione conta più della velocità.
const WHISPER_MODEL = 'whisper-large-v3'
// Whisper accetta circa 244 token per il prompt; ~800 caratteri sono safe
const MAX_VOCAB_CHARS = 800

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseKeyterms(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  let list: unknown
  try { list = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const term = item.replace(/\s+/g, ' ').trim()
    if (!term || term.length > MAX_KEYTERM_CHARS) continue
    if (term.split(' ').length > MAX_KEYTERM_WORDS) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length >= MAX_KEYTERMS) break
  }
  return out
}

async function transcribeScribe(
  audio: Blob, filename: string, keyterms: string[], apiKey: string,
): Promise<string> {
  const form = new FormData()
  form.append('file', audio, filename)
  form.append('model_id', SCRIBE_MODEL)
  form.append('language_code', 'it')
  // Niente etichette tipo "(rumore)": in reparto finirebbero nel ticket.
  form.append('tag_audio_events', 'false')
  // Un campo `keyterms` per termine, come lo inviano gli SDK ufficiali.
  for (const term of keyterms) form.append('keyterms', term)

  const res = await fetch(ELEVENLABS_URL, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
    signal: AbortSignal.timeout(SCRIBE_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Scribe ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json()
  return (data?.text || '').toString().trim()
}

async function transcribeWhisper(
  audio: Blob, filename: string, vocabulary: string, apiKey: string,
): Promise<string> {
  // Re-forward to Groq with the shape it expects (OpenAI-compatible)
  const form = new FormData()
  form.append('file', audio, filename)
  form.append('model', WHISPER_MODEL)
  form.append('language', 'it')
  form.append('response_format', 'json')
  form.append('temperature', '0')
  if (vocabulary) form.append('prompt', vocabulary)

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error('Groq Whisper API error', res.status, errText)
    throw new Error(`Whisper API error ${res.status}`)
  }
  const data = await res.json()
  return (data?.text || '').toString().trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')
    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!elevenKey && !groqKey) {
      return jsonResponse({ error: 'Nessuna chiave di trascrizione configurata' }, 500)
    }

    const inbound = await req.formData()
    const audio = inbound.get('audio')
    // File estende Blob: un solo controllo copre entrambi.
    if (!(audio instanceof Blob)) {
      return jsonResponse({ error: 'Campo "audio" mancante o non valido' }, 400)
    }
    const filename = (audio as File).name || 'recording.webm'

    const keyterms = parseKeyterms(inbound.get('keyterms'))
    // Vocabulary hint opzionale per Whisper (nomi macchine, termini tecnici).
    const vocabularyRaw = inbound.get('vocabulary')
    const vocabulary = typeof vocabularyRaw === 'string'
      ? vocabularyRaw.trim().slice(0, MAX_VOCAB_CHARS)
      : ''

    if (elevenKey) {
      try {
        const text = await transcribeScribe(audio, filename, keyterms, elevenKey)
        console.info(`[transcribe] scribe ok, keyterms=${keyterms.length}`)
        return jsonResponse({ text, engine: SCRIBE_MODEL })
      } catch (err) {
        // Si registra e si passa al ripiego: il tecnico non deve accorgersene.
        console.error('[transcribe] scribe failed, fallback to whisper:',
          err instanceof Error ? err.message : err)
        if (!groqKey) return jsonResponse({ error: 'Trascrizione non riuscita' }, 502)
      }
    }

    try {
      const text = await transcribeWhisper(audio, filename, vocabulary, groqKey!)
      return jsonResponse({ text, engine: WHISPER_MODEL })
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Whisper API error' }, 502)
    }
  } catch (err) {
    console.error('transcribe fatal error:', err)
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Errore imprevisto',
    }, 500)
  }
})

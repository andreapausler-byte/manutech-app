/**
 * Edge Function: transcribe
 *
 * Trascrive un file audio (webm/ogg/mp4/m4a/wav) in testo italiano usando
 * Groq Whisper (whisper-large-v3-turbo). API OpenAI-compatible, free tier
 * generoso — niente carta di credito richiesta.
 *
 * Secrets necessari (Supabase Dashboard → Edge Functions → Secrets):
 *   GROQ_API_KEY — chiave API Groq (gsk_...)
 *
 * Body: multipart/form-data con campo "audio" (Blob).
 *
 * Response:
 *   { text: string } oppure { error: string }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
// whisper-large-v3-turbo: fastest, identical quality for short clips
const WHISPER_MODEL = 'whisper-large-v3-turbo'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'GROQ_API_KEY non configurata' }, 500)

    const inbound = await req.formData()
    const audio = inbound.get('audio')
    if (!(audio instanceof File) && !(audio instanceof Blob)) {
      return jsonResponse({ error: 'Campo "audio" mancante o non valido' }, 400)
    }

    // Re-forward to Groq with the shape it expects (OpenAI-compatible)
    const outbound = new FormData()
    const filename = (audio as File).name || 'recording.webm'
    outbound.append('file', audio, filename)
    outbound.append('model', WHISPER_MODEL)
    outbound.append('language', 'it')
    outbound.append('response_format', 'json')
    outbound.append('temperature', '0')

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: outbound,
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Groq Whisper API error', res.status, errText)
      return jsonResponse({ error: `Whisper API error ${res.status}` }, 502)
    }

    const data = await res.json()
    const text = (data?.text || '').toString().trim()
    return jsonResponse({ text })
  } catch (err) {
    console.error('transcribe fatal error:', err)
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Errore imprevisto',
    }, 500)
  }
})

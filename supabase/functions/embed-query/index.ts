/**
 * Edge Function: embed-query
 *
 * Wrapper privato che converte un testo in embedding Voyage AI
 * (modello voyage-multilingual-2, dimensione 1024) per essere usato
 * dall'edge function assistant-chat nella ricerca semantica sui
 * chunks della knowledge base.
 *
 * Mantiene la VOYAGE_API_KEY segretata in un solo posto server-side.
 *
 * Body JSON:
 *   { text: string }
 *
 * Response:
 *   { embedding: number[] }  // lunghezza 1024
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-multilingual-2'

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
    const authHeader = req.headers.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

    // Autenticazione minima: l'utente deve essere loggato
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    )
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return jsonResponse({ error: 'Utente non valido' }, 401)

    const voyageKey = Deno.env.get('VOYAGE_API_KEY')
    if (!voyageKey) return jsonResponse({ error: 'VOYAGE_API_KEY not configured' }, 500)

    const body = await req.json().catch(() => ({}))
    const text = (body.text || '').toString().trim()
    if (!text) return jsonResponse({ error: 'text è obbligatoria' }, 400)
    if (text.length > 8000) return jsonResponse({ error: 'text troppo lungo (max 8000)' }, 400)

    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${voyageKey}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: [text],
        input_type: 'query',
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Voyage API error:', res.status, errText)
      return jsonResponse({ error: `Voyage API error ${res.status}` }, 502)
    }

    const data = await res.json()
    const embedding = data.data?.[0]?.embedding
    if (!Array.isArray(embedding)) {
      return jsonResponse({ error: 'Embedding non valido' }, 502)
    }

    return jsonResponse({ embedding })
  } catch (err) {
    console.error('embed-query fatal:', err)
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Errore imprevisto',
    }, 500)
  }
})

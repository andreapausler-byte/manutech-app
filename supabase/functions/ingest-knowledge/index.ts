/**
 * Edge Function: ingest-knowledge
 *
 * Pipeline di indicizzazione della knowledge base per una macchina.
 * Chiamata (fire-and-forget) dal client dopo che l'utente modifica
 * documenti, istruzioni, o maintenance_logs della macchina.
 *
 * Sorgenti indicizzate (tutte per machine_id):
 *   - machines.attachments[] (solo PDF — immagini skippate in Sprint A)
 *   - machines.usage_instructions (testo libero)
 *   - machines.maintenance_instructions (testo libero)
 *   - maintenance_logs (inclusi esterni): title + description + contractor
 *     e allegati media[] PDF
 *
 * Pipeline per ogni sorgente:
 *   1. Estrai testo (PDF via unpdf, testo diretto per campi)
 *   2. Chunking ~500 token con overlap 50
 *   3. Batch embedding via Voyage AI (voyage-multilingual-2, dim 1024)
 *   4. DELETE + INSERT atomico in document_chunks per
 *      (machine_id, source_kind, source_ref)
 *
 * Secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — già presenti
 *   VOYAGE_API_KEY                           — da configurare
 *
 * Body JSON:
 *   { machine_id: string }
 *
 * Response: { ok: true, sources: N, chunks: M, duration_ms: T }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.11.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-multilingual-2'
const VOYAGE_BATCH_SIZE = 64         // max items per batch (limite Voyage)
const CHUNK_TARGET_CHARS = 2000      // ~500 token (stima 4 char/token)
const CHUNK_OVERLAP_CHARS = 200      // ~50 token
const MAX_DOC_CHARS = 500_000        // safety: non indicizzare manuali >500k caratteri

// ─── Tipi ────────────────────────────────────────────────────────
interface Chunk {
  source_kind: 'attachment' | 'usage_instructions' | 'maintenance_instructions' | 'maintenance_log'
  source_ref: string | null
  source_label: string
  category: string | null
  chunk_index: number
  content: string
  page_number: number | null
}

interface Attachment {
  type?: string
  category?: string
  name?: string
  url?: string
}

interface MaintenanceLog {
  id: string
  title: string | null
  description: string | null
  parts_replaced: string | null
  type: string | null
  contractor_name: string | null
  contractor_reference: string | null
  is_external: boolean | null
  performed_at: string | null
  media: Attachment[] | null
}

// ─── Helpers ─────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isPdfAttachment(a: Attachment): boolean {
  if (!a.url) return false
  const isPdf = a.type === 'pdf' || (a.name && a.name.toLowerCase().endsWith('.pdf'))
  return !!isPdf
}

// Chunking semplice basato su caratteri con overlap. Cerca di spezzare
// su fine-paragrafo/punto per preservare coerenza semantica.
function chunkText(text: string, maxChars = CHUNK_TARGET_CHARS, overlap = CHUNK_OVERLAP_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]

  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length)
    if (end < clean.length) {
      // preferisci tagliare su fine frase nel range [end-200, end]
      const lookback = Math.max(start + maxChars * 0.6, end - 200)
      const slice = clean.slice(lookback, end)
      const lastDot = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('\n'),
      )
      if (lastDot > 0) end = Math.floor(lookback) + lastDot + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = end - overlap
    if (start < 0) start = 0
  }
  return chunks.filter(c => c.length > 20) // scarta chunk troppo corti
}

async function downloadFile(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch (e) {
    console.warn('downloadFile failed:', url, e)
    return null
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number } | null> {
  try {
    const pdf = await getDocumentProxy(bytes)
    const { text } = await extractText(pdf, { mergePages: true })
    return { text: typeof text === 'string' ? text : (text as string[]).join('\n'), pages: pdf.numPages }
  } catch (e) {
    console.warn('PDF extract failed:', e)
    return null
  }
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  // Voyage limit: batch size max 128, ma teniamoci conservativi a 64
  const all: number[][] = []
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH_SIZE) {
    const batch = texts.slice(i, i + VOYAGE_BATCH_SIZE)
    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: batch,
        input_type: 'document',
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Voyage embedding error ${res.status}: ${err}`)
    }
    const data = await res.json()
    for (const item of data.data || []) {
      if (Array.isArray(item.embedding)) all.push(item.embedding)
    }
  }
  return all
}

// ─── Main handler ────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const startedAt = Date.now()

  try {
    const authHeader = req.headers.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

    const voyageKey = Deno.env.get('VOYAGE_API_KEY')
    if (!voyageKey) return jsonResponse({ error: 'VOYAGE_API_KEY not configured' }, 500)

    const body = await req.json().catch(() => ({}))
    const machineId: string | undefined = body.machine_id
    if (!machineId) return jsonResponse({ error: 'machine_id è obbligatorio' }, 400)

    // ── Client autenticato come utente (per recuperare org_id via RPC) ──
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    )
    const { data: { user }, error: userErr } = await userSupabase.auth.getUser()
    if (userErr || !user) return jsonResponse({ error: 'Utente non valido' }, 401)

    const { data: orgIdRaw } = await userSupabase.rpc('get_my_org_id')
    const orgId: string | null = orgIdRaw
    if (!orgId) return jsonResponse({ error: 'Profilo utente incompleto' }, 400)

    // ── Client con service_role per INSERT su document_chunks ──
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Fetch machine + verifica org_id ──
    const { data: machine, error: mErr } = await adminSupabase
      .from('machines')
      .select('id, name, usage_instructions, maintenance_instructions, attachments, org_id')
      .eq('id', machineId)
      .single()
    if (mErr || !machine) return jsonResponse({ error: 'Macchina non trovata' }, 404)
    if (machine.org_id !== orgId) return jsonResponse({ error: 'Forbidden' }, 403)

    // ── Fetch maintenance logs della macchina ──
    const { data: logs, error: lErr } = await adminSupabase
      .from('maintenance_logs')
      .select('id, title, description, parts_replaced, type, contractor_name, contractor_reference, is_external, performed_at, media')
      .eq('machine_id', machineId)
      .eq('org_id', orgId)
      .order('performed_at', { ascending: false })
    if (lErr) console.warn('logs fetch error:', lErr.message)

    // ── Costruisci lista di chunks da indicizzare ──
    const allChunks: Chunk[] = []

    // 1) usage_instructions
    if (machine.usage_instructions && machine.usage_instructions.trim().length > 20) {
      const pieces = chunkText(machine.usage_instructions.slice(0, MAX_DOC_CHARS))
      pieces.forEach((c, i) => allChunks.push({
        source_kind: 'usage_instructions',
        source_ref: null,
        source_label: `Istruzioni d'uso — ${machine.name}`,
        category: 'istruzioni_uso',
        chunk_index: i,
        content: c,
        page_number: null,
      }))
    }

    // 2) maintenance_instructions
    if (machine.maintenance_instructions && machine.maintenance_instructions.trim().length > 20) {
      const pieces = chunkText(machine.maintenance_instructions.slice(0, MAX_DOC_CHARS))
      pieces.forEach((c, i) => allChunks.push({
        source_kind: 'maintenance_instructions',
        source_ref: null,
        source_label: `Istruzioni di manutenzione — ${machine.name}`,
        category: 'istruzioni_manutenzione',
        chunk_index: i,
        content: c,
        page_number: null,
      }))
    }

    // 3) attachments PDF
    const attachments: Attachment[] = Array.isArray(machine.attachments) ? machine.attachments : []
    for (const att of attachments) {
      if (!isPdfAttachment(att) || !att.url) continue
      const bytes = await downloadFile(att.url)
      if (!bytes) continue
      const pdf = await extractPdfText(bytes)
      if (!pdf || !pdf.text.trim()) continue
      const pieces = chunkText(pdf.text.slice(0, MAX_DOC_CHARS))
      const label = `${att.name || 'Documento'} (${att.category || 'documento'})`
      pieces.forEach((c, i) => allChunks.push({
        source_kind: 'attachment',
        source_ref: att.url!,
        source_label: label,
        category: att.category || null,
        chunk_index: i,
        content: c,
        page_number: null, // unpdf merge mode non preserva numero pagina
      }))
    }

    // 4) maintenance_logs (interni ed esterni) + allegati media
    for (const log of (logs || []) as MaintenanceLog[]) {
      const logDateLabel = log.performed_at
        ? new Date(log.performed_at).toLocaleDateString('it-IT')
        : ''
      const contractorLabel = log.is_external && log.contractor_name
        ? `Intervento ditta ${log.contractor_name}${log.contractor_reference ? ` (rif. ${log.contractor_reference})` : ''}`
        : `Intervento interno`
      const sourceLabel = `${contractorLabel} — ${logDateLabel}`

      // Testo bundle del log
      const parts: string[] = []
      parts.push(`Titolo: ${log.title || ''}`)
      if (log.description) parts.push(`Descrizione: ${log.description}`)
      if (log.parts_replaced) parts.push(`Ricambi: ${log.parts_replaced}`)
      if (log.type) parts.push(`Tipo: ${log.type}`)
      if (log.is_external) {
        if (log.contractor_name) parts.push(`Ditta esterna: ${log.contractor_name}`)
        if (log.contractor_reference) parts.push(`Riferimento bolla/fattura: ${log.contractor_reference}`)
      }
      const logText = parts.join('\n').trim()
      if (logText.length > 20) {
        const pieces = chunkText(logText)
        pieces.forEach((c, i) => allChunks.push({
          source_kind: 'maintenance_log',
          source_ref: log.id,
          source_label: sourceLabel,
          category: log.is_external ? 'intervento_esterno' : 'intervento_interno',
          chunk_index: i,
          content: c,
          page_number: null,
        }))
      }

      // Allegati PDF del log (es. rapporto intervento ditta esterna)
      const logMedia: Attachment[] = Array.isArray(log.media) ? log.media : []
      let mediaIdx = 0
      for (const m of logMedia) {
        if (!isPdfAttachment(m) || !m.url) continue
        const bytes = await downloadFile(m.url)
        if (!bytes) continue
        const pdf = await extractPdfText(bytes)
        if (!pdf || !pdf.text.trim()) continue
        const pieces = chunkText(pdf.text.slice(0, MAX_DOC_CHARS))
        const mediaLabel = `${sourceLabel} — allegato ${m.name || 'documento'}`
        pieces.forEach((c, i) => allChunks.push({
          source_kind: 'maintenance_log',
          source_ref: `${log.id}:${mediaIdx}`,
          source_label: mediaLabel,
          category: log.is_external ? 'intervento_esterno' : 'intervento_interno',
          chunk_index: i,
          content: c,
          page_number: null,
        }))
        mediaIdx++
      }
    }

    if (allChunks.length === 0) {
      // Comunque cancella i vecchi chunks di questa macchina
      await adminSupabase.from('document_chunks').delete().eq('machine_id', machineId)
      return jsonResponse({
        ok: true,
        sources: 0,
        chunks: 0,
        duration_ms: Date.now() - startedAt,
        message: 'Nessuna sorgente indicizzabile',
      })
    }

    // ── Embedding in batch ──
    const embeddings = await embedBatch(allChunks.map(c => c.content), voyageKey)
    if (embeddings.length !== allChunks.length) {
      return jsonResponse({
        error: `Embedding count mismatch: ${embeddings.length} vs ${allChunks.length}`,
      }, 500)
    }

    // ── Atomic replace: DELETE vecchi chunks + INSERT nuovi ──
    const { error: delErr } = await adminSupabase
      .from('document_chunks')
      .delete()
      .eq('machine_id', machineId)
    if (delErr) {
      console.warn('delete chunks error:', delErr.message)
    }

    // INSERT in batch per non saturare il payload
    const rows = allChunks.map((c, i) => ({
      org_id: orgId,
      machine_id: machineId,
      source_kind: c.source_kind,
      source_ref: c.source_ref,
      source_label: c.source_label,
      category: c.category,
      chunk_index: c.chunk_index,
      content: c.content,
      page_number: c.page_number,
      embedding: embeddings[i],
    }))

    const INSERT_BATCH = 100
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH)
      const { error: insErr } = await adminSupabase
        .from('document_chunks')
        .insert(batch)
      if (insErr) {
        console.error('insert chunks error:', insErr.message)
        return jsonResponse({ error: `Insert chunks fallito: ${insErr.message}` }, 500)
      }
    }

    const sourceSet = new Set(allChunks.map(c => `${c.source_kind}:${c.source_ref || ''}`))

    return jsonResponse({
      ok: true,
      sources: sourceSet.size,
      chunks: allChunks.length,
      duration_ms: Date.now() - startedAt,
    })
  } catch (err) {
    console.error('ingest-knowledge fatal:', err)
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Errore imprevisto',
    }, 500)
  }
})

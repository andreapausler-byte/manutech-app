-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 028: Knowledge Base AI                            ║
-- ║                                                                ║
-- ║  Trasforma le schede macchina in biblioteca tecnica           ║
-- ║  interrogabile via AI (RAG con embeddings Voyage).            ║
-- ║                                                                ║
-- ║  Tabelle/modifiche:                                           ║
-- ║   - Estensione pgvector                                       ║
-- ║   - NEW: document_chunks (chunks indicizzati)                 ║
-- ║   - ALTER: maintenance_logs (+ contractor fields, + media)    ║
-- ║   - RPC: search_knowledge (hybrid vector+FTS)                 ║
-- ║   - RPC: queue_machine_reindex (cancella chunks vecchi)       ║
-- ║   - RPC: get_knowledge_stats (per badge UI)                   ║
-- ║   - RPC: create_maintenance_log (esteso con contractor+media) ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ────────────────────────────────────────────────────────────────
-- 1. pgvector extension
-- ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;


-- ────────────────────────────────────────────────────────────────
-- 2. Estensione maintenance_logs con campi ditta esterna e media
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contractor_name TEXT,
  ADD COLUMN IF NOT EXISTS contractor_reference TEXT;

-- `media` è già presente come JSONB DEFAULT '[]' (vedi schema.sql:161)
-- quindi non serve aggiungerla, la popoliamo direttamente con
-- [{type, category, name, url}] analogo a machines.attachments


-- ────────────────────────────────────────────────────────────────
-- 3. Tabella document_chunks
-- ────────────────────────────────────────────────────────────────
-- Ogni chunk rappresenta una porzione indicizzata di una fonte
-- (manuale PDF, istruzioni testuali, maintenance_log).
-- embedding è vector(1024) perché Voyage multilingual-2 usa 1024 dim.

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,

  -- Identificazione della sorgente
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'attachment',                 -- file in machines.attachments
    'usage_instructions',         -- machines.usage_instructions (testo libero)
    'maintenance_instructions',   -- machines.maintenance_instructions
    'maintenance_log'             -- riga di maintenance_logs
  )),
  source_ref TEXT,     -- url file per attachment, uuid log per maintenance_log
  source_label TEXT,   -- etichetta human-readable citata dall'AI
  category TEXT,       -- manuale_uso, scheda_tecnica, intervento_esterno, ecc.

  -- Contenuto e ricerca
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  page_number INTEGER,           -- se PDF
  embedding vector(1024),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('italian', coalesce(content, ''))
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_machine ON public.document_chunks(machine_id);
CREATE INDEX IF NOT EXISTS idx_chunks_org ON public.document_chunks(org_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON public.document_chunks(machine_id, source_kind, source_ref);
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON public.document_chunks USING GIN(search_vector);
-- HNSW per ricerca semantica veloce su embedding
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON public.document_chunks USING hnsw (embedding vector_cosine_ops);


-- ────────────────────────────────────────────────────────────────
-- 4. RLS document_chunks (read per org, write solo via service role)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chunks_select ON public.document_chunks;
CREATE POLICY chunks_select ON public.document_chunks
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

-- INSERT/UPDATE/DELETE solo via edge function con service_role
-- (la pipeline ingest-knowledge usa SERVICE_ROLE_KEY)


-- ────────────────────────────────────────────────────────────────
-- 5. RPC: search_knowledge (hybrid vector + FTS)
-- ────────────────────────────────────────────────────────────────
-- Se query_embedding è fornito: ricerca semantica cosine similarity
-- Se solo query_text: fallback FTS italiano
-- Filtra per org_id sempre, opzionalmente per machine_id

CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_text TEXT,
  query_embedding vector(1024) DEFAULT NULL,
  p_machine_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  machine_id UUID,
  source_kind TEXT,
  source_ref TEXT,
  source_label TEXT,
  category TEXT,
  content TEXT,
  page_number INTEGER,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_query tsquery;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Ramo 1: ricerca semantica se abbiamo embedding
  IF query_embedding IS NOT NULL THEN
    RETURN QUERY
    SELECT
      c.id,
      c.machine_id,
      c.source_kind,
      c.source_ref,
      c.source_label,
      c.category,
      c.content,
      c.page_number,
      (1 - (c.embedding <=> query_embedding))::real AS similarity
    FROM public.document_chunks c
    WHERE c.org_id = v_org_id
      AND (p_machine_id IS NULL OR c.machine_id = p_machine_id)
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding
    LIMIT GREATEST(1, LEAST(p_limit, 20));
    RETURN;
  END IF;

  -- Ramo 2: fallback FTS italiano
  v_query := websearch_to_tsquery('italian', coalesce(query_text, ''));
  IF v_query IS NULL OR v_query::text = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.machine_id,
    c.source_kind,
    c.source_ref,
    c.source_label,
    c.category,
    c.content,
    c.page_number,
    ts_rank(c.search_vector, v_query) AS similarity
  FROM public.document_chunks c
  WHERE c.org_id = v_org_id
    AND (p_machine_id IS NULL OR c.machine_id = p_machine_id)
    AND c.search_vector @@ v_query
  ORDER BY similarity DESC
  LIMIT GREATEST(1, LEAST(p_limit, 20));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_knowledge(TEXT, vector, UUID, INTEGER)
  TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 6. RPC: get_knowledge_stats (badge UI "Biblioteca AI")
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_knowledge_stats(p_machine_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_result JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('chunks', 0, 'sources', 0, 'last_indexed_at', NULL);
  END IF;

  SELECT jsonb_build_object(
    'chunks', COUNT(*),
    'sources', COUNT(DISTINCT (source_kind, source_ref)),
    'last_indexed_at', MAX(created_at),
    'by_kind', jsonb_object_agg(source_kind, kind_count)
  ) INTO v_result
  FROM (
    SELECT
      source_kind,
      source_ref,
      created_at,
      COUNT(*) OVER (PARTITION BY source_kind) AS kind_count
    FROM public.document_chunks
    WHERE machine_id = p_machine_id AND org_id = v_org_id
  ) t;

  RETURN COALESCE(v_result, jsonb_build_object('chunks', 0, 'sources', 0, 'last_indexed_at', NULL));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_knowledge_stats(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 7. RPC: queue_machine_reindex (purge chunks per una macchina)
-- ────────────────────────────────────────────────────────────────
-- Chiamata lato client quando l'utente modifica documenti/istruzioni.
-- Cancella i chunks esistenti così che la pipeline ingest-knowledge
-- possa ricrearli da zero. In realtà la pipeline lo fa già in maniera
-- idempotente, ma questa RPC offre un modo "pulito" per forzare reindex
-- senza aspettare la edge function.

CREATE OR REPLACE FUNCTION public.queue_machine_reindex(p_machine_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_deleted INTEGER;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN RETURN 0; END IF;

  -- Verifica che l'utente abbia diritto sulla macchina (stessa org)
  IF NOT EXISTS (
    SELECT 1 FROM public.machines
    WHERE id = p_machine_id AND org_id = v_org_id
  ) THEN
    RETURN 0;
  END IF;

  -- L'edge function ricreerà i chunks. Questa RPC è opzionale:
  -- serve solo a segnalare che il "versione vecchia" non è più valida.
  -- In pratica noi NON cancelliamo qui: lasciamo che l'edge function
  -- faccia DELETE+INSERT per sorgente specifica. Se il client vuole
  -- forzare un reset totale, può chiamare DELETE diretto.

  SELECT COUNT(*) INTO v_deleted
  FROM public.document_chunks
  WHERE machine_id = p_machine_id AND org_id = v_org_id;

  RETURN v_deleted;  -- ritorna chunks attuali (per info UI)
END;
$$;

GRANT EXECUTE ON FUNCTION public.queue_machine_reindex(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 8. RPC: create_maintenance_log (v2 con contractor + media)
-- ────────────────────────────────────────────────────────────────
-- Sostituisce la versione in 020_fix_maintenance_logs_rls.sql
-- aggiungendo: is_external, contractor_name, contractor_reference, media

CREATE OR REPLACE FUNCTION public.create_maintenance_log(
  _machine_id UUID,
  _title TEXT,
  _plan_id UUID DEFAULT NULL,
  _report_id UUID DEFAULT NULL,
  _component_id UUID DEFAULT NULL,
  _type TEXT DEFAULT 'programmata',
  _description TEXT DEFAULT NULL,
  _performed_by_name TEXT DEFAULT NULL,
  _duration_minutes INTEGER DEFAULT NULL,
  _parts_replaced TEXT DEFAULT NULL,
  _performed_at TIMESTAMPTZ DEFAULT now(),
  _is_external BOOLEAN DEFAULT FALSE,
  _contractor_name TEXT DEFAULT NULL,
  _contractor_reference TEXT DEFAULT NULL,
  _media JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _user_id UUID;
  _result JSONB;
BEGIN
  SELECT id, org_id, role INTO _user_id, _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Profilo utente non trovato';
  END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Permesso negato: ruolo % non autorizzato', _role;
  END IF;

  INSERT INTO public.maintenance_logs (
    machine_id, plan_id, report_id, component_id, type, title, description,
    performed_by, performed_by_name, duration_minutes, parts_replaced,
    performed_at, org_id,
    is_external, contractor_name, contractor_reference, media
  ) VALUES (
    _machine_id, _plan_id, _report_id, _component_id, _type, _title, _description,
    _user_id, _performed_by_name, _duration_minutes, _parts_replaced,
    _performed_at, _org_id,
    COALESCE(_is_external, FALSE), _contractor_name, _contractor_reference, COALESCE(_media, '[]'::jsonb)
  )
  RETURNING to_jsonb(maintenance_logs.*) INTO _result;

  RETURN _result;
END;
$$;

-- Drop signature vecchia (10 params) per evitare ambiguità di overloading
DROP FUNCTION IF EXISTS public.create_maintenance_log(
  UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TIMESTAMPTZ
);

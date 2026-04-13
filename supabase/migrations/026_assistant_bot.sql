-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 026: Assistente AI per tecnici (RAG + Claude)    ║
-- ║  - Tabelle assistant_conversations + assistant_messages     ║
-- ║  - Indice FTS italiano su reports (title+desc+closure_*)    ║
-- ║  - RPC search_similar_reports per retrieval                 ║
-- ║  - RPC count_assistant_messages_last_hour per rate limit    ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ────────────────────────────────────────────────────────────────
-- 1. FULL-TEXT SEARCH SU REPORTS (ricerca semantica "lite")
-- ────────────────────────────────────────────────────────────────
-- Colonna generata con tsvector italiano che indicizza:
-- titolo + descrizione + causa radice + azione risolutiva.
-- Quest'ultimi due sono oro: contengono il know-how del tecnico.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('italian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('italian', coalesce(closure_root_cause, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(closure_action, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(closure_parts, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_reports_search_vector
  ON public.reports USING gin(search_vector);

-- ────────────────────────────────────────────────────────────────
-- 2. RPC: search_similar_reports
-- ────────────────────────────────────────────────────────────────
-- Ricerca top-N report RISOLTI o CHIUSI simili alla query utente,
-- filtrati per org (tramite get_my_org_id) e opzionalmente per macchina.
-- SECURITY DEFINER perché deve leggere report chiusi indipendentemente
-- da eventuali policy più restrittive dell'utente chiamante.

CREATE OR REPLACE FUNCTION public.search_similar_reports(
  query_text TEXT,
  p_limit INTEGER DEFAULT 5,
  p_machine_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  severity TEXT,
  type TEXT,
  machine_id UUID,
  closure_root_cause TEXT,
  closure_action TEXT,
  closure_parts TEXT,
  closure_hours NUMERIC,
  closed_at TIMESTAMPTZ,
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

  -- websearch_to_tsquery gestisce input "naturale" senza operatori
  v_query := websearch_to_tsquery('italian', coalesce(query_text, ''));
  IF v_query IS NULL OR v_query::text = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.description,
    r.severity,
    r.type,
    r.machine_id,
    r.closure_root_cause,
    r.closure_action,
    r.closure_parts,
    r.closure_hours,
    r.closed_at,
    ts_rank(r.search_vector, v_query) AS similarity
  FROM public.reports r
  WHERE r.org_id = v_org_id
    AND r.status IN ('risolta', 'chiuso')
    AND r.search_vector @@ v_query
    AND (p_machine_id IS NULL OR r.machine_id = p_machine_id)
    -- include solo report con almeno un campo di chiusura valorizzato
    AND (r.closure_root_cause IS NOT NULL OR r.closure_action IS NOT NULL)
  ORDER BY similarity DESC, r.closed_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 20));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_similar_reports(TEXT, INTEGER, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 3. TABELLA assistant_conversations
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL DEFAULT 'Nuova conversazione',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conv_user
  ON public.assistant_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conv_org
  ON public.assistant_conversations(org_id);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

-- L'utente vede solo le proprie conversazioni nella propria org
CREATE POLICY assistant_conv_select ON public.assistant_conversations
  FOR SELECT TO authenticated
  USING (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

CREATE POLICY assistant_conv_insert ON public.assistant_conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

CREATE POLICY assistant_conv_update ON public.assistant_conversations
  FOR UPDATE TO authenticated
  USING (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

CREATE POLICY assistant_conv_delete ON public.assistant_conversations
  FOR DELETE TO authenticated
  USING (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

-- ────────────────────────────────────────────────────────────────
-- 4. TABELLA assistant_messages
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,   -- [{report_id, title, similarity}]
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_msg_conv
  ON public.assistant_messages(conversation_id, created_at);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

-- L'utente vede solo i messaggi delle proprie conversazioni
CREATE POLICY assistant_msg_select ON public.assistant_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = public.get_my_user_id()
    )
  );

CREATE POLICY assistant_msg_insert ON public.assistant_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = public.get_my_user_id()
    )
  );

-- ────────────────────────────────────────────────────────────────
-- 5. RPC: count_assistant_messages_last_hour (rate limit)
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_assistant_messages_last_hour()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := public.get_my_user_id();
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.assistant_messages m
  JOIN public.assistant_conversations c ON c.id = m.conversation_id
  WHERE c.user_id = v_user_id
    AND m.role = 'user'
    AND m.created_at > NOW() - INTERVAL '1 hour';

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_assistant_messages_last_hour() TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 6. Trigger: aggiorna updated_at su conversations
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bump_assistant_conv_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.assistant_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assistant_msg_bump_conv ON public.assistant_messages;
CREATE TRIGGER trg_assistant_msg_bump_conv
  AFTER INSERT ON public.assistant_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_assistant_conv_updated_at();

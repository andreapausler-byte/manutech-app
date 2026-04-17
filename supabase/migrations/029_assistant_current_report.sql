-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 029: Assistente AI — esclusione report corrente    ║
-- ║                                                                ║
-- ║  Bugfix: quando l'assistente è aperto dentro la scheda di una ║
-- ║  segnalazione (report_id nel body), l'RPC search_similar_     ║
-- ║  reports poteva ritornare proprio quella segnalazione come    ║
-- ║  "simile" e la risposta del modello finiva per agganciarsi a  ║
-- ║  quel duplicato invece che al Report corrente. Aggiungiamo un ║
-- ║  parametro opzionale p_exclude_report_id per filtrarla via.   ║
-- ║                                                                ║
-- ║  Default NULL → comportamento invariato per chi non lo passa. ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Drop della signature a 4 parametri introdotta in 027 per poter
-- aggiungere il nuovo parametro in coda senza ambiguità.
DROP FUNCTION IF EXISTS public.search_similar_reports(TEXT, INTEGER, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.search_similar_reports(
  query_text TEXT,
  p_limit INTEGER DEFAULT 5,
  p_machine_id UUID DEFAULT NULL,
  p_include_open BOOLEAN DEFAULT FALSE,
  p_exclude_report_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  severity TEXT,
  status TEXT,
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
    r.status,
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
    AND r.search_vector @@ v_query
    AND (p_machine_id IS NULL OR r.machine_id = p_machine_id)
    AND (p_exclude_report_id IS NULL OR r.id <> p_exclude_report_id)
    AND (
      p_include_open
      OR (
        r.status IN ('risolta', 'chiuso')
        AND (r.closure_root_cause IS NOT NULL OR r.closure_action IS NOT NULL)
      )
    )
  ORDER BY similarity DESC, COALESCE(r.closed_at, r.created_at) DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 20));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_similar_reports(TEXT, INTEGER, UUID, BOOLEAN, UUID) TO authenticated;

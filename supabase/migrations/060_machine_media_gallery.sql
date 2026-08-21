-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 060: Galleria media per macchinario                ║
-- ║                                                                ║
-- ║  Le foto e i video di una macchina oggi vivono sparsi su       ║
-- ║  quattro tabelle (segnalazioni, chat, log manutenzione,        ║
-- ║  interventi). Il collegamento alla macchina c'è già in tutte   ║
-- ║  e quattro: manca solo una vista aggregata.                    ║
-- ║                                                                ║
-- ║  Applica:                                                     ║
-- ║   - indice su reports(machine_id) (mancava: c'era per logs    ║
-- ║     e interventions, non per le segnalazioni)                 ║
-- ║   - get_machine_media()  — feed unificato, org-scoped         ║
-- ║   - toggle_machine_media_feature() — promuove/rimuove una     ║
-- ║     foto dalla galleria curata (machines.attachments), senza  ║
-- ║     richiedere il ruolo admin che machines_update impone      ║
-- ║                                                                ║
-- ║  Nessuna nuova tabella: la v1 è una query, non uno schema.    ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ─── 1. Indice mancante ────────────────────────────────────────
-- Il feed filtra le segnalazioni per macchina: senza questo è un
-- seq scan su tutta la tabella reports a ogni apertura scheda.
CREATE INDEX IF NOT EXISTS idx_reports_machine
  ON public.reports(machine_id)
  WHERE machine_id IS NOT NULL;


-- ─── 2. Feed unificato ─────────────────────────────────────────
-- Ritorna foto e video di una macchina da tutte le sorgenti, in
-- ordine cronologico inverso, deduplicati per URL.
--
-- SECURITY DEFINER perché attraversa quattro tabelle con RLS
-- diverse (chat inclusa): il filtro org lo applichiamo qui una
-- volta sola, come get_my_org_id() impone ovunque.
--
-- Match macchina: FK machine_id, con fallback sullo snapshot
-- testuale `machine` per le segnalazioni vecchie senza FK.
-- L'audio è escluso di proposito — questa è una galleria visiva.

CREATE OR REPLACE FUNCTION public.get_machine_media(
  _machine_id UUID,
  _limit  INT DEFAULT 60,
  _offset INT DEFAULT 0
)
RETURNS TABLE (
  url          TEXT,
  thumb_url    TEXT,
  media_type   TEXT,
  name         TEXT,
  taken_at     TIMESTAMPTZ,
  source       TEXT,
  source_id    UUID,
  source_label TEXT,
  author_name  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org  TEXT;
  v_name TEXT;
BEGIN
  v_org := public.get_my_org_id();
  IF v_org IS NULL THEN RETURN; END IF;

  -- La macchina deve esistere nella mia org: altrimenti il DEFINER
  -- diventerebbe una scorciatoia per leggere media di altre org.
  SELECT m.name INTO v_name
    FROM public.machines m
   WHERE m.id = _machine_id AND m.org_id = v_org;
  IF v_name IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH raw AS (
    -- ── Media allegati alla segnalazione ──
    SELECT
      e.value->>'url'                         AS m_url,
      e.value->>'thumb_url'                   AS m_thumb,
      lower(COALESCE(e.value->>'type', 'photo')) AS m_type,
      e.value->>'name'                        AS m_name,
      r.created_at                            AS m_taken_at,
      'segnalazione'::TEXT                    AS m_source,
      r.id                                    AS m_source_id,
      COALESCE(r.display_id, r.title)         AS m_source_label,
      r.created_by_name                       AS m_author
    FROM public.reports r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.media, '[]'::jsonb)) e
    WHERE r.org_id = v_org
      AND (r.machine_id = _machine_id
           OR (r.machine_id IS NULL AND r.machine = v_name))

    UNION ALL

    -- ── Media inviati in chat sulla segnalazione ──
    -- source_id resta il report: il tap in galleria deve aprire il
    -- ticket, non un messaggio isolato.
    SELECT
      e.value->>'url',
      e.value->>'thumb_url',
      lower(COALESCE(e.value->>'type', 'photo')),
      e.value->>'name',
      c.created_at,
      'chat'::TEXT,
      c.report_id,
      COALESCE(r.display_id, r.title),
      c.user_name
    FROM public.comments c
    JOIN public.reports r ON r.id = c.report_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.media, '[]'::jsonb)) e
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (r.machine_id = _machine_id
           OR (r.machine_id IS NULL AND r.machine = v_name))

    UNION ALL

    -- ── Media dei log di manutenzione ──
    SELECT
      e.value->>'url',
      e.value->>'thumb_url',
      lower(COALESCE(e.value->>'type', 'photo')),
      e.value->>'name',
      l.performed_at,
      'manutenzione'::TEXT,
      l.id,
      l.title,
      l.performed_by_name
    FROM public.maintenance_logs l
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.media, '[]'::jsonb)) e
    WHERE l.org_id = v_org AND l.machine_id = _machine_id

    UNION ALL

    -- ── Media degli interventi v2 ──
    SELECT
      e.value->>'url',
      e.value->>'thumb_url',
      lower(COALESCE(e.value->>'type', 'photo')),
      e.value->>'name',
      COALESCE(i.actual_end_at, i.scheduled_start_at, i.created_at),
      'intervento'::TEXT,
      i.id,
      i.title,
      COALESCE(i.assigned_to_name, i.created_by_name)
    FROM public.interventions i
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.media, '[]'::jsonb)) e
    WHERE i.org_id = v_org AND i.machine_id = _machine_id
  ),
  visual AS (
    SELECT
      r.m_url,
      r.m_thumb,
      CASE WHEN r.m_type = 'video' THEN 'video' ELSE 'photo' END AS m_type,
      r.m_name, r.m_taken_at, r.m_source, r.m_source_id, r.m_source_label, r.m_author
    FROM raw r
    WHERE r.m_url IS NOT NULL
      AND r.m_type IN ('photo', 'image', 'video')
  ),
  dedup AS (
    -- Stessa foto rilanciata in chat e allegata al log: una riga sola,
    -- quella più vecchia (è l'occorrenza originale).
    SELECT DISTINCT ON (v.m_url) v.*
      FROM visual v
     ORDER BY v.m_url, v.m_taken_at ASC
  )
  SELECT d.m_url, d.m_thumb, d.m_type, d.m_name,
         d.m_taken_at, d.m_source, d.m_source_id, d.m_source_label, d.m_author
    FROM dedup d
   ORDER BY d.m_taken_at DESC NULLS LAST
   LIMIT GREATEST(_limit, 0) OFFSET GREATEST(_offset, 0);
END;
$$;


-- ─── 3. Galleria curata: promuovi / rimuovi ────────────────────
-- machines_update è admin-only, ma chi riconosce la foto che vale
-- è il tecnico davanti alla macchina. Questa RPC gli permette di
-- promuoverla in machines.attachments (categoria 'foto', dove il
-- tab Documentazione la mostra già) senza aprire l'update della
-- riga macchina a tutti.
--
-- Toggle: se l'URL è già in evidenza lo rimuove, altrimenti lo
-- aggiunge. La rimozione tocca SOLO le voci con `promoted_from`,
-- mai i documenti caricati a mano dall'admin.

CREATE OR REPLACE FUNCTION public.toggle_machine_media_feature(
  _machine_id UUID,
  _media      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org         TEXT;
  v_user_name   TEXT;
  v_url         TEXT;
  v_attachments JSONB;
  v_existing    JSONB;
  v_new         JSONB;
BEGIN
  SELECT u.org_id, u.name INTO v_org, v_user_name
    FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;

  v_url := _media->>'url';
  IF v_url IS NULL OR v_url = '' THEN RAISE EXCEPTION 'URL media mancante'; END IF;

  SELECT COALESCE(m.attachments, '[]'::jsonb) INTO v_attachments
    FROM public.machines m
   WHERE m.id = _machine_id AND m.org_id = v_org;
  IF v_attachments IS NULL THEN RAISE EXCEPTION 'Macchinario non trovato'; END IF;

  SELECT a.value INTO v_existing
    FROM jsonb_array_elements(v_attachments) a
   WHERE a.value->>'url' = v_url
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Già presente. Se è una promozione, il toggle la rimuove;
    -- se è un documento caricato a mano, non si tocca.
    IF v_existing->'promoted_from' IS NULL THEN
      RETURN v_attachments;
    END IF;

    SELECT COALESCE(jsonb_agg(a.value), '[]'::jsonb) INTO v_attachments
      FROM jsonb_array_elements(v_attachments) a
     WHERE a.value->>'url' <> v_url;
  ELSE
    v_new := jsonb_build_object(
      'type',      CASE WHEN _media->>'type' = 'video' THEN 'video' ELSE 'image' END,
      'category',  'foto',
      'name',      COALESCE(NULLIF(_media->>'name', ''), 'Foto dalla galleria'),
      'url',       v_url,
      'thumb_url', _media->>'thumb_url',
      'uploaded_at',      COALESCE(_media->>'taken_at', now()::TEXT),
      'uploaded_by_name', _media->>'author_name',
      'promoted_from', jsonb_build_object(
        'source', _media->>'source',
        'id',     _media->>'source_id',
        'label',  _media->>'source_label'
      ),
      'promoted_by', v_user_name,
      'promoted_at', now()
    );
    v_attachments := v_attachments || jsonb_build_array(v_new);
  END IF;

  UPDATE public.machines
     SET attachments = v_attachments, updated_at = now()
   WHERE id = _machine_id AND org_id = v_org;

  RETURN v_attachments;
END;
$$;


GRANT EXECUTE ON FUNCTION public.get_machine_media(UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_machine_media_feature(UUID, JSONB) TO authenticated;

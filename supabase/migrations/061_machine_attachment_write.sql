-- ╔══════════════════════════════════════════════════════════════╗
-- ║  061 — Scrittura allegati macchina dal campo                  ║
-- ║                                                                ║
-- ║  La 060 ha dato al tecnico un modo per PROMUOVERE una foto     ║
-- ║  già esistente nella galleria curata. Restava fuori il caso    ║
-- ║  opposto e più ovvio: scattare una foto nuova, o caricare il   ║
-- ║  PDF che il fornitore ha appena lasciato, stando davanti alla  ║
-- ║  macchina. Entrambi scrivono machines.attachments, che RLS     ║
-- ║  apre al solo admin (machines_update).                         ║
-- ║                                                                ║
-- ║  - add_machine_attachment() — aggiunge UNA voce agli           ║
-- ║    attachments della macchina, con autore e data messi dal     ║
-- ║    server, non dal client                                      ║
-- ║                                                                ║
-- ║  Nessuna nuova tabella, nessuna nuova colonna.                 ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ─── Aggiungi allegato ─────────────────────────────────────────
-- SECURITY DEFINER per lo stesso motivo di toggle_machine_media_feature:
-- machines_update è admin-only, ma chi ha in mano la macchina (e la
-- fotocamera) è l'operatore o il tecnico.
--
-- Cosa decide il server, e il client non può falsificare:
--   · uploaded_by / uploaded_by_name — chi è loggato, non chi dice di essere
--   · uploaded_at                    — adesso
--   · org_id della macchina          — deve essere la mia
--
-- Cosa il client può passare: url, thumb_url, name, type, category.
-- `type` e `category` sono su whitelist: un valore fuori lista
-- creerebbe una voce che nessuna vista sa mostrare, cioè un file
-- caricato e invisibile — peggio di un errore.
--
-- Idempotente sull'URL: due tap sul tasto non creano due voci.
--
-- Il tetto a 200 voci non è una policy di prodotto, è un freno: la
-- colonna è JSONB su una riga sola, e un loop di upload la farebbe
-- crescere senza limite.

CREATE OR REPLACE FUNCTION public.add_machine_attachment(
  _machine_id UUID,
  _attachment JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org         TEXT;
  v_user_id     UUID;
  v_user_name   TEXT;
  v_url         TEXT;
  v_type        TEXT;
  v_category    TEXT;
  v_name        TEXT;
  v_attachments JSONB;
  v_new         JSONB;
BEGIN
  SELECT u.id, u.org_id, u.name INTO v_user_id, v_org, v_user_name
    FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;

  v_url := NULLIF(_attachment->>'url', '');
  IF v_url IS NULL THEN RAISE EXCEPTION 'URL allegato mancante'; END IF;

  v_type := COALESCE(_attachment->>'type', 'pdf');
  IF v_type NOT IN ('image', 'video', 'pdf') THEN
    RAISE EXCEPTION 'Tipo allegato non ammesso: %', v_type;
  END IF;

  v_category := COALESCE(NULLIF(_attachment->>'category', ''), 'foto');
  IF v_category NOT IN (
    'foto', 'scheda_tecnica', 'manuale_uso', 'manuale_manutenzione',
    'intervento_esterno', 'contratto_manutenzione', 'certificato'
  ) THEN
    RAISE EXCEPTION 'Categoria non ammessa: %', v_category;
  END IF;

  -- La macchina deve esistere nella mia org: senza questo controllo il
  -- DEFINER diventerebbe una scorciatoia per scrivere su altre org.
  SELECT COALESCE(m.attachments, '[]'::jsonb) INTO v_attachments
    FROM public.machines m
   WHERE m.id = _machine_id AND m.org_id = v_org;
  IF v_attachments IS NULL THEN RAISE EXCEPTION 'Macchinario non trovato'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_attachments) a
     WHERE a.value->>'url' = v_url
  ) THEN
    RETURN v_attachments;
  END IF;

  IF jsonb_array_length(v_attachments) >= 200 THEN
    RAISE EXCEPTION 'Troppi allegati su questo macchinario (max 200)';
  END IF;

  v_name := COALESCE(
    NULLIF(_attachment->>'name', ''),
    CASE WHEN v_type = 'pdf' THEN 'Documento' ELSE 'Foto dal campo' END
  );

  v_new := jsonb_build_object(
    'type',      v_type,
    'category',  v_category,
    'name',      v_name,
    'url',       v_url,
    'thumb_url', _attachment->>'thumb_url',
    'uploaded_at',      now(),
    'uploaded_by',      v_user_id,
    'uploaded_by_name', v_user_name,
    'uploaded_from',    'campo'
  );

  v_attachments := v_attachments || jsonb_build_array(v_new);

  UPDATE public.machines
     SET attachments = v_attachments, updated_at = now()
   WHERE id = _machine_id AND org_id = v_org;

  RETURN v_attachments;
END;
$$;


GRANT EXECUTE ON FUNCTION public.add_machine_attachment(UUID, JSONB) TO authenticated;

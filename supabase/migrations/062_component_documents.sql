-- ╔══════════════════════════════════════════════════════════════╗
-- ║  062 — Documenti e foto sul componente                        ║
-- ║                                                                ║
-- ║  Un macchinario non è un blocco unico: è una pompa, un         ║
-- ║  motore, un quadro. Fino a ieri l'unico modo di dare una       ║
-- ║  scheda propria alla pompa era creare un macchinario finto —   ║
-- ║  e l'anagrafica si riempiva di doppioni.                       ║
-- ║                                                                ║
-- ║  Qui i componenti restano componenti e prendono i loro file.   ║
-- ║  Scelta di fondo: NON una tabella allegati per componente, ma  ║
-- ║  un'etichetta sugli allegati che già esistono. Un file resta   ║
-- ║  un file della macchina — compare in galleria, nelle cartelle  ║
-- ║  documentali e nella biblioteca AI come prima — e in più sa    ║
-- ║  a quale componente appartiene.                                ║
-- ║                                                                ║
-- ║  Applica:                                                     ║
-- ║   - add_machine_attachment() accetta `component_id`           ║
-- ║   - set_machine_attachment_component() — archivia un file già ║
-- ║     caricato sotto un componente (o lo riporta alla macchina) ║
-- ║   - due trigger che tengono le etichette allineate quando il  ║
-- ║     componente viene rinominato o cancellato                  ║
-- ║                                                                ║
-- ║  Nessuna nuova tabella, nessuna nuova colonna.                ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ─── Aggiungi allegato (ora con componente) ────────────────────
-- Rimpiazza la versione della 061. Unica differenza: il client può
-- passare `component_id`, e il server lo verifica invece di fidarsi —
-- il componente deve esistere, appartenere a QUESTA macchina e alla
-- mia org. Un id fuori posto sarebbe un file archiviato sotto un
-- componente di un'altra macchina, cioè un file perso.
--
-- `component_name` lo scrive il server: è uno snapshot per le viste
-- che mostrano i file senza aver caricato i componenti (il mobile),
-- e i trigger qui sotto lo tengono aggiornato.

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
  v_org          TEXT;
  v_user_id      UUID;
  v_user_name    TEXT;
  v_url          TEXT;
  v_type         TEXT;
  v_category     TEXT;
  v_name         TEXT;
  v_component_id UUID;
  v_component    TEXT;
  v_attachments  JSONB;
  v_new          JSONB;
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

  -- Componente opzionale, ma se c'è dev'essere di questa macchina.
  v_component_id := NULLIF(_attachment->>'component_id', '')::UUID;
  IF v_component_id IS NOT NULL THEN
    SELECT c.name INTO v_component
      FROM public.machine_components c
     WHERE c.id = v_component_id
       AND c.machine_id = _machine_id
       AND c.org_id = v_org;
    IF v_component IS NULL THEN
      RAISE EXCEPTION 'Componente non trovato su questo macchinario';
    END IF;
  END IF;

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

  IF v_component_id IS NOT NULL THEN
    v_new := v_new || jsonb_build_object(
      'component_id',   v_component_id,
      'component_name', v_component
    );
  END IF;

  v_attachments := v_attachments || jsonb_build_array(v_new);

  UPDATE public.machines
     SET attachments = v_attachments, updated_at = now()
   WHERE id = _machine_id AND org_id = v_org;

  RETURN v_attachments;
END;
$$;


-- ─── Archivia un file esistente sotto un componente ────────────
-- Il caso normale in officina: il manuale della pompa è già nella
-- cartella Schede Tecniche da mesi, e solo oggi la pompa diventa un
-- componente. Questa RPC sposta l'etichetta, non il file: l'URL
-- resta lo stesso, la galleria non se ne accorge, l'indice AI nemmeno.
--
-- `_component_id` NULL riporta il file alla macchina (togli etichetta).
--
-- SECURITY DEFINER come le sorelle: machines_update è admin-only, ma
-- chi sa a quale pompa appartiene quel PDF è il tecnico.

CREATE OR REPLACE FUNCTION public.set_machine_attachment_component(
  _machine_id   UUID,
  _url          TEXT,
  _component_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org         TEXT;
  v_component   TEXT;
  v_attachments JSONB;
BEGIN
  SELECT u.org_id INTO v_org
    FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;

  IF NULLIF(_url, '') IS NULL THEN RAISE EXCEPTION 'URL allegato mancante'; END IF;

  SELECT COALESCE(m.attachments, '[]'::jsonb) INTO v_attachments
    FROM public.machines m
   WHERE m.id = _machine_id AND m.org_id = v_org;
  IF v_attachments IS NULL THEN RAISE EXCEPTION 'Macchinario non trovato'; END IF;

  IF _component_id IS NOT NULL THEN
    SELECT c.name INTO v_component
      FROM public.machine_components c
     WHERE c.id = _component_id
       AND c.machine_id = _machine_id
       AND c.org_id = v_org;
    IF v_component IS NULL THEN
      RAISE EXCEPTION 'Componente non trovato su questo macchinario';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(
           CASE
             WHEN a.value->>'url' <> _url THEN a.value
             WHEN _component_id IS NULL   THEN a.value - 'component_id' - 'component_name'
             ELSE a.value || jsonb_build_object(
                    'component_id',   _component_id,
                    'component_name', v_component)
           END
           ORDER BY a.ord), '[]'::jsonb)
    INTO v_attachments
    FROM jsonb_array_elements(v_attachments) WITH ORDINALITY a(value, ord);

  UPDATE public.machines
     SET attachments = v_attachments, updated_at = now()
   WHERE id = _machine_id AND org_id = v_org;

  RETURN v_attachments;
END;
$$;


-- ─── Le etichette seguono il componente ────────────────────────
-- Rinomini "Pompa dosatrice" in "Pompa dosatrice CIP" e i file
-- continuano a mostrare il vecchio nome: uno snapshot che nessuno
-- aggiorna è peggio di nessuno snapshot. Questi due trigger sono il
-- prezzo della denormalizzazione, ed è basso.

CREATE OR REPLACE FUNCTION public.sync_component_attachment_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;

  UPDATE public.machines m
     SET attachments = (
           SELECT COALESCE(jsonb_agg(
                    CASE WHEN a.value->>'component_id' = NEW.id::TEXT
                         THEN a.value || jsonb_build_object('component_name', NEW.name)
                         ELSE a.value END
                    ORDER BY a.ord), '[]'::jsonb)
             FROM jsonb_array_elements(COALESCE(m.attachments, '[]'::jsonb))
                  WITH ORDINALITY a(value, ord)
         )
   WHERE m.id = NEW.machine_id
     AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(m.attachments, '[]'::jsonb)) a
            WHERE a.value->>'component_id' = NEW.id::TEXT
         );

  RETURN NEW;
END;
$$;


-- Cancellare il componente non cancella i suoi file: un manuale resta
-- utile anche quando la pompa è stata smontata. Cade solo l'etichetta,
-- e il file torna a essere della macchina.
CREATE OR REPLACE FUNCTION public.clear_component_attachment_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.machines m
     SET attachments = (
           SELECT COALESCE(jsonb_agg(
                    CASE WHEN a.value->>'component_id' = OLD.id::TEXT
                         THEN a.value - 'component_id' - 'component_name'
                         ELSE a.value END
                    ORDER BY a.ord), '[]'::jsonb)
             FROM jsonb_array_elements(COALESCE(m.attachments, '[]'::jsonb))
                  WITH ORDINALITY a(value, ord)
         )
   WHERE m.id = OLD.machine_id
     AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(m.attachments, '[]'::jsonb)) a
            WHERE a.value->>'component_id' = OLD.id::TEXT
         );

  RETURN OLD;
END;
$$;


DROP TRIGGER IF EXISTS trg_component_rename_attachments ON public.machine_components;
CREATE TRIGGER trg_component_rename_attachments
  AFTER UPDATE OF name ON public.machine_components
  FOR EACH ROW EXECUTE FUNCTION public.sync_component_attachment_name();

DROP TRIGGER IF EXISTS trg_component_delete_attachments ON public.machine_components;
CREATE TRIGGER trg_component_delete_attachments
  AFTER DELETE ON public.machine_components
  FOR EACH ROW EXECUTE FUNCTION public.clear_component_attachment_tags();


GRANT EXECUTE ON FUNCTION public.set_machine_attachment_component(UUID, TEXT, UUID) TO authenticated;


-- ─── La biblioteca AI conosce i pezzi ──────────────────────────
-- "Che pompa monta il tino filtro?" è una domanda da reparto, e finora
-- l'unica risposta possibile era aprire il PDF giusto. I componenti sono
-- schede corte e dense (costruttore, modello, matricola, note): entrano
-- nell'indice come sorgente propria, non dentro il testo della macchina,
-- così l'assistente può citare il pezzo invece del macchinario.
--
-- Vedi supabase/functions/ingest-knowledge/index.ts.

ALTER TABLE public.document_chunks
  DROP CONSTRAINT IF EXISTS document_chunks_source_kind_check;

ALTER TABLE public.document_chunks
  ADD CONSTRAINT document_chunks_source_kind_check
  CHECK (source_kind IN (
    'attachment',
    'usage_instructions',
    'maintenance_instructions',
    'maintenance_log',
    'report_chat',
    'component'
  ));

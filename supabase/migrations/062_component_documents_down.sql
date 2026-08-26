-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 062 DOWN — Documenti e foto sul componente
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Le etichette `component_id`/`component_name` restano dentro
-- machines.attachments: sono dati dell'utente, e un file archiviato
-- sotto la pompa non diventa sbagliato solo perché la UI non sa più
-- mostrarlo. Senza i trigger però smettono di seguire rinomine e
-- cancellazioni dei componenti: se si torna indietro sul serio,
-- ripulirle a mano è la scelta prudente.
--
--   UPDATE public.machines m SET attachments = (
--     SELECT COALESCE(jsonb_agg(a.value - 'component_id' - 'component_name'
--                               ORDER BY a.ord), '[]'::jsonb)
--       FROM jsonb_array_elements(COALESCE(m.attachments,'[]'::jsonb))
--            WITH ORDINALITY a(value, ord));

DROP TRIGGER IF EXISTS trg_component_rename_attachments ON public.machine_components;
DROP TRIGGER IF EXISTS trg_component_delete_attachments ON public.machine_components;
DROP FUNCTION IF EXISTS public.sync_component_attachment_name();
DROP FUNCTION IF EXISTS public.clear_component_attachment_tags();
DROP FUNCTION IF EXISTS public.set_machine_attachment_component(UUID, TEXT, UUID);

-- add_machine_attachment torna alla versione 061 (senza componente):
-- riapplicare 061_machine_attachment_write.sql.
DROP FUNCTION IF EXISTS public.add_machine_attachment(UUID, JSONB);


-- Il vincolo torna alla lista della 041. I chunk 'component' vanno tolti
-- prima, altrimenti il vincolo non si ricrea.
DELETE FROM public.document_chunks WHERE source_kind = 'component';

ALTER TABLE public.document_chunks
  DROP CONSTRAINT IF EXISTS document_chunks_source_kind_check;

ALTER TABLE public.document_chunks
  ADD CONSTRAINT document_chunks_source_kind_check
  CHECK (source_kind IN (
    'attachment',
    'usage_instructions',
    'maintenance_instructions',
    'maintenance_log',
    'report_chat'
  ));

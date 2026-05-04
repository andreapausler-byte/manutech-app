-- Down migration 038 — rollback al CHECK senza 'report_chat'.
-- ATTENZIONE: se ci sono chunk con source_kind='report_chat' la query
-- DELETE qui sotto li rimuove (necessario per rispettare il vincolo).

DELETE FROM public.document_chunks WHERE source_kind = 'report_chat';

ALTER TABLE public.document_chunks
  DROP CONSTRAINT IF EXISTS document_chunks_source_kind_check;

ALTER TABLE public.document_chunks
  ADD CONSTRAINT document_chunks_source_kind_check
  CHECK (source_kind IN (
    'attachment',
    'usage_instructions',
    'maintenance_instructions',
    'maintenance_log'
  ));

-- Migration 038 — estende source_kind in document_chunks per ammettere
-- 'report_chat' (chunks generati dai ticket chiusi + chat).
--
-- Sprint B della knowledge base: i ticket risolti diventano memoria
-- permanente. Vedi supabase/functions/ingest-knowledge/index.ts.

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

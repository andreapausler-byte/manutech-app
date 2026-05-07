-- ──────────────────────────────────────────────────────────────────────────
-- Migration 047 — comments.kind: aggiunge 'spare_request'
-- ──────────────────────────────────────────────────────────────────────────
-- Il nuovo flusso di richiesta ricambi del Tecnico (SpareRequestModal) non
-- è più voice-only: il tecnico può compilare manualmente con foto+titolo+
-- note. Per distinguerlo dal vecchio voice_spare_request introduciamo un
-- nuovo `kind` 'spare_request'.
--
-- Migration 038 vincolava i kind a un set fisso che non include il nuovo
-- valore → INSERT del comment di tracking falliva con
-- "comments_kind_check" violation.
--
-- DOWN: 047_comment_kind_spare_request_down.sql

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_kind_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_kind_check CHECK (kind IN (
    'chat',
    'voice_new_ticket',
    'voice_update',
    'voice_close',
    'voice_note',
    'voice_spare_request',
    'spare_request'
  ));

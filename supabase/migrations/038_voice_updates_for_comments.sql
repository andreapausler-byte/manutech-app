-- ──────────────────────────────────────────────────────────────────────────
-- Migration 038 — Voice updates per comments
-- ──────────────────────────────────────────────────────────────────────────
-- Aggiunge supporto per aggiornamenti vocali (note, update, close,
-- spare_request) ai commenti dei ticket. Riusa la tabella `comments`
-- esistente invece di creare una nuova tabella `ticket_updates`.
--
-- Colonne aggiunte:
--   kind        — tipo di commento. Default 'chat' (retrocompatibile con
--                 i commenti chat esistenti). Valori vocali specifici:
--                 voice_new_ticket, voice_update, voice_close,
--                 voice_note, voice_spare_request
--   extra_data  — JSONB con i campi estratti da Claude Haiku (es.
--                 azioni_eseguite, ricambi_ordinati, stato_proposto, ...)
--   confidence  — punteggio 0-100 di confidenza dell'estrazione AI
--
-- L'audio originale viene salvato nella colonna `media` JSONB esistente
-- come [{type:'audio', url, name, duration_sec}].
--
-- RLS: nessuna modifica. Le policy esistenti su `comments` (basate su
-- org_id) coprono già i nuovi record.

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'chat'
    CHECK (kind IN (
      'chat',
      'voice_new_ticket',
      'voice_update',
      'voice_close',
      'voice_note',
      'voice_spare_request'
    )),
  ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence INTEGER DEFAULT NULL
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100));

-- Indice per query rapide: "tutti i voice_update di un report"
CREATE INDEX IF NOT EXISTS idx_comments_report_kind
  ON public.comments(report_id, kind)
  WHERE kind <> 'chat';

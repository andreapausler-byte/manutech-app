-- Rollback migration 047: rimuove 'spare_request' dai kind ammessi.
-- Attenzione: se ci sono comments con kind='spare_request' la ricreazione
-- del CHECK fallirà. Pulirli prima:
--   UPDATE public.comments SET kind='chat' WHERE kind='spare_request';

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_kind_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_kind_check CHECK (kind IN (
    'chat',
    'voice_new_ticket',
    'voice_update',
    'voice_close',
    'voice_note',
    'voice_spare_request'
  ));

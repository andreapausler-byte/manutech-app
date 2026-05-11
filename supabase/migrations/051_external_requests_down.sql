-- Rollback migration 051

-- Pulisce eventuali righe con kind='intervento' o comments con kind='request_chat'
-- prima di ripristinare i constraint originali. Attenzione: questo perde dati.

-- Ripristina CHECK comment.kind senza 'request_chat'
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_kind_check;

UPDATE public.comments SET kind='chat' WHERE kind='request_chat';

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

-- Drop indici e colonne
DROP INDEX IF EXISTS idx_comments_spare_order;
DROP INDEX IF EXISTS idx_activities_spare_order;
DROP INDEX IF EXISTS idx_spo_kind;
DROP INDEX IF EXISTS idx_spo_scheduled;

ALTER TABLE public.comments DROP COLUMN IF EXISTS spare_order_id;
ALTER TABLE public.activities DROP COLUMN IF EXISTS spare_order_id;

ALTER TABLE public.spare_part_orders
  DROP CONSTRAINT IF EXISTS spo_kind_check;

ALTER TABLE public.spare_part_orders
  DROP COLUMN IF EXISTS kind,
  DROP COLUMN IF EXISTS scheduled_at,
  DROP COLUMN IF EXISTS duration_h,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS specialty;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 056 — DOWN
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- ⚠ DESTRUCTIVE per i comments di sistema gia' scritti dopo l'apply 056.
-- Prima del DROP del CHECK, converti i kind 'system_intervention_*' in
-- 'chat' (oppure cancellali se preferisci pulire). Pattern identico a
-- mig 051 down per 'request_chat'.

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_kind_check;

UPDATE public.comments
  SET kind = 'chat'
  WHERE kind IN ('system_intervention_planned', 'system_intervention_rescheduled');

ALTER TABLE public.comments
  ADD CONSTRAINT comments_kind_check CHECK (kind IN (
    'chat',
    'voice_new_ticket',
    'voice_update',
    'voice_close',
    'voice_note',
    'voice_spare_request',
    'spare_request',
    'request_chat'
  ));

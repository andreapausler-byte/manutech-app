-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 064 DOWN — "Mi è servita"
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- I ManuCoin già accreditati restano: il registro token è
-- immutabile per costruzione (018).

DROP TRIGGER IF EXISTS trg_reward_helpful_closure ON public.reactions;
DROP FUNCTION IF EXISTS public.reward_helpful_closure();

DELETE FROM public.reactions WHERE type = 'servito';
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_type_check;
ALTER TABLE public.reactions ADD CONSTRAINT reactions_type_check
  CHECK (type IN ('utile', 'confermo', 'risolto', 'grazie'));

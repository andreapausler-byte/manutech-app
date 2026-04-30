-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 036 DOWN: Rollback super_admin role + RPC moderazione
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ⚠️ Prima di eseguire questo DOWN, demota eventuali super_admin esistenti:
--    UPDATE public.users SET role = 'admin' WHERE role = 'super_admin';

-- ── 1. Drop RPCs ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reject_org(UUID, TEXT);
DROP FUNCTION IF EXISTS public.approve_org(UUID);
DROP FUNCTION IF EXISTS public.list_pending_orgs();

-- ── 2. Ripristina constraint role pre-036 ─────────────────
-- ⚠️ Se esistono ancora righe con role='super_admin' questo fallisce.
--    Demota prima (vedi note sopra).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('operatore', 'tecnico', 'admin'));

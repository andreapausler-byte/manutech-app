-- ──────────────────────────────────────────────────────────────────────────
-- Migration 039 — users RLS: estendi update/delete a super_admin
-- ──────────────────────────────────────────────────────────────────────────
-- La policy users_update originale (schema.sql:338) permette UPDATE solo a:
--   - se stessi (auth_id = auth.uid())
--   - get_my_role() = 'admin'
--
-- Il ruolo 'super_admin' (introdotto in migration 036) era escluso, quindi
-- un super_admin che tentava di cambiare il ruolo di un utente (es. da
-- AdminUsers UI) riceveva un errore PostgREST silenzioso:
--   "Cannot coerce the result to a single JSON object"
-- (causato da .single() su 0 righe aggiornate per RLS bloccante).
--
-- Questa migration:
--   1. Aggiorna users_update per includere super_admin
--   2. Aggiorna users_delete per coerenza (anche super_admin può rimuovere)
--
-- DOWN: 039_users_admin_super_admin_down.sql

-- ── 1. users_update: admin OR super_admin ──────────────────
DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (
    auth_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'super_admin')
  );

-- ── 2. users_delete: admin OR super_admin ──────────────────
DROP POLICY IF EXISTS "users_delete" ON public.users;
CREATE POLICY "users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (
    public.get_my_role() IN ('admin', 'super_admin')
    AND org_id = public.get_my_org_id()
  );

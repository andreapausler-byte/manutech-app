-- Rollback migration 039: ripristina policy users_update / users_delete
-- senza super_admin (versione originale di schema.sql).

DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid() OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "users_delete" ON public.users;
CREATE POLICY "users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin' AND org_id = public.get_my_org_id());

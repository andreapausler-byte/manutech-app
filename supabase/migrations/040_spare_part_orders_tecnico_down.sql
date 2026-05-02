-- Rollback migration 040: ripristina policy spare_part_orders originali
-- (admin only) come definite in migration 022_spare_parts.sql.

DROP POLICY IF EXISTS "spo_insert" ON public.spare_part_orders;
CREATE POLICY "spo_insert" ON public.spare_part_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "spo_update" ON public.spare_part_orders;
CREATE POLICY "spo_update" ON public.spare_part_orders
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "spo_delete" ON public.spare_part_orders;
CREATE POLICY "spo_delete" ON public.spare_part_orders
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() = 'admin'
  );

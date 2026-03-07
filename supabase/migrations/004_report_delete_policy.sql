-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 004 — Delete policy per reports (solo admin)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE POLICY "reports_delete" ON public.reports
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() = 'admin'
  );

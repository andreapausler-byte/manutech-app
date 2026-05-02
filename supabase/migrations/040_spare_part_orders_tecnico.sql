-- ──────────────────────────────────────────────────────────────────────────
-- Migration 040 — spare_part_orders RLS: tecnico puo' richiedere ricambi
-- ──────────────────────────────────────────────────────────────────────────
-- Le policy originali (migration 022) limitavano INSERT/UPDATE/DELETE su
-- spare_part_orders al solo ruolo 'admin'. Questo blocca il flow vocale
-- `tech_spare_request` (introdotto con la feature voice STT Tecnico):
-- l'app riceve "new row violates row-level security policy".
--
-- Questa migration:
--   1. INSERT: estende ad admin + tecnico + super_admin
--      (il Tecnico puo' richiedere ricambi via voce o via UI)
--   2. UPDATE: estende ad admin + super_admin
--      (gestione stato ordine resta in mano agli admin)
--   3. DELETE: idem UPDATE
--
-- Inoltre il DROP+CREATE forza un refresh dello schema PostgREST,
-- analogo al pattern usato in migration 039 per users.
--
-- DOWN: 040_spare_part_orders_tecnico_down.sql

-- ── 1. spo_insert: admin OR tecnico OR super_admin ─────────
DROP POLICY IF EXISTS "spo_insert" ON public.spare_part_orders;
CREATE POLICY "spo_insert" ON public.spare_part_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'tecnico', 'super_admin')
  );

-- ── 2. spo_update: admin OR super_admin ────────────────────
DROP POLICY IF EXISTS "spo_update" ON public.spare_part_orders;
CREATE POLICY "spo_update" ON public.spare_part_orders
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'super_admin')
  );

-- ── 3. spo_delete: admin OR super_admin ────────────────────
DROP POLICY IF EXISTS "spo_delete" ON public.spare_part_orders;
CREATE POLICY "spo_delete" ON public.spare_part_orders
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'super_admin')
  );

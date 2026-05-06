-- Down migration 045 — rollback overview piani manutenzione AI
DROP FUNCTION IF EXISTS public.get_assistant_maintenance_plans_overview();

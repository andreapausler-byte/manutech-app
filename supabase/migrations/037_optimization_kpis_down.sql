-- Down migration 037 — rollback optimization KPIs RPC
DROP FUNCTION IF EXISTS public.get_optimization_dashboard();

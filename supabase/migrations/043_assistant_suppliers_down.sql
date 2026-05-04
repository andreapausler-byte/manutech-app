-- Down migration 043 — rollback fornitori AI
DROP FUNCTION IF EXISTS public.get_assistant_suppliers_overview();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 035 DOWN — revoca i GRANT espliciti a service_role
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ⚠️ ATTENZIONE: applicare questo DOWN spegne signup-org Edge Function
-- se i default privileges del progetto non grantano automaticamente
-- service_role su public.organizations / public.users (caso che ha
-- richiesto la migration 035 in primo luogo).
--
-- Pre-condizione raccomandata prima del rollback:
--   • Verificare che default privileges su schema public concedano ALL a
--     service_role, altrimenti il rollback torna allo stato bacato.
--     Query diagnostica:
--       SELECT grantee, privilege_type FROM information_schema.role_table_grants
--        WHERE table_schema='public' AND table_name='organizations'
--          AND grantee='service_role';
--
-- REVOKE è simmetrico al GRANT della UP migration. Non tocca SELECT a
-- 'authenticated' (gestito da migration 032).

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.organizations FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.users         FROM service_role;

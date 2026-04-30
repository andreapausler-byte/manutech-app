-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 035: GRANT espliciti a service_role per signup-org Edge Function
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- BUG FIX (rilevato in staging dopo deploy Edge Function signup-org):
--
--   Step A INSERT public.organizations falliva con:
--     "permission denied for table organizations"
--
-- Causa: le migration 032/033 creano la tabella organizations e definiscono
-- RLS + policy, ma grantano solo SELECT a 'authenticated'. Il ruolo Postgres
-- 'service_role' (usato dall'Edge Function via SUPABASE_SERVICE_ROLE_KEY)
-- bypassa RLS ma NON è esonerato dai GRANT a livello tabella. In progetti
-- Supabase con default privileges configurati, service_role riceve auto-
-- maticamente ALL su nuove tabelle nello schema public; in altri progetti
-- (es. staging creato da zero) il default può non essere attivo, lasciando
-- service_role senza permessi sulle tabelle create da migration.
--
-- Fix: GRANT espliciti su tutte le tabelle che la Edge Function signup-org
-- tocca con service_role:
--   • organizations  — Step A (INSERT), Step D (UPDATE owner_user_id)
--   • users          — Step C (INSERT profilo applicativo)
--
-- Idempotente: GRANT è naturalmente idempotente in Postgres (re-eseguibile
-- senza effetti collaterali), nessun IF NOT EXISTS necessario.
--
-- DOWN: 035_grant_service_role_signup_down.sql revoca i grant aggiunti.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users         TO service_role;

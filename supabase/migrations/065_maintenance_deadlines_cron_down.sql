-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 065 DOWN — scadenze dal server
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Attenzione: senza la 065 il frontend v5.25 non genera più gli avvisi
-- di scadenza (li lascia al server). Rollback del DB = rollback del
-- frontend, oppure nessun allarme.

SELECT cron.unschedule('maintenance-deadlines')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maintenance-deadlines');

DROP FUNCTION IF EXISTS public.check_maintenance_deadlines();
DROP TABLE IF EXISTS public.maintenance_alerts;

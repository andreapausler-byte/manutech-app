-- ╔══════════════════════════════════════════════════════════════╗
-- ║  065 — Le scadenze di manutenzione le controlla il server     ║
-- ║                                                                ║
-- ║  Fino a ott 2026 gli avvisi "in scadenza" e "scaduta" li      ║
-- ║  generava il telefono (useAutoNotifications), ogni 5 minuti,  ║
-- ║  solo mentre qualcuno aveva l'app aperta:                     ║
-- ║   - nessuno apre l'app → nessun allarme;                      ║
-- ║   - il "già inviato" stava su ogni telefono → più telefoni,   ║
-- ║     più doppioni dello stesso avviso a tutta l'org;           ║
-- ║   - lo scaduto si segnalava una volta e poi mai più.          ║
-- ║                                                                ║
-- ║  Qui un job giornaliero (pg_cron, come il digest della 011):  ║
-- ║   - "in scadenza": una volta per ciclo, a 5 giorni o meno;    ║
-- ║   - "scaduta": il giorno della scadenza e poi un richiamo     ║
-- ║     ogni 3 giorni finché non si registra l'intervento — ma    ║
-- ║     non mentre qualcuno l'ha presa in carico (in_corso).      ║
-- ║  Il registro maintenance_alerts è unico per tutta l'org: un   ║
-- ║  avviso parte una volta sola, chiunque apra l'app.            ║
-- ║                                                                ║
-- ║  Gli avvisi sono righe in notifications: il trigger della     ║
-- ║  009/010 li trasforma in push ed email come tutto il resto.   ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ─── 1. Registro degli avvisi inviati ─────────────────────────
-- Un ciclo = il periodo dall'ultimo intervento registrato (o dalla
-- creazione del piano). Registrato un nuovo intervento, cambia
-- cycle_start e gli avvisi ripartono da capo.
CREATE TABLE IF NOT EXISTS public.maintenance_alerts (
  plan_id      UUID NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('reminder', 'overdue')),
  cycle_start  TIMESTAMPTZ NOT NULL,
  first_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  times_sent   INTEGER NOT NULL DEFAULT 1,
  org_id       TEXT NOT NULL DEFAULT 'default',
  PRIMARY KEY (plan_id, kind, cycle_start)
);

ALTER TABLE public.maintenance_alerts ENABLE ROW LEVEL SECURITY;

-- Solo lettura per l'org (diagnostica). Scrive solo la funzione.
DROP POLICY IF EXISTS "maintenance_alerts_select" ON public.maintenance_alerts;
CREATE POLICY "maintenance_alerts_select" ON public.maintenance_alerts
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());


-- ─── 2. Il controllo ──────────────────────────────────────────
-- Destinatario come prima: il tecnico del piano, oppure tutta l'org
-- (target_user NULL) se il piano non ha un assegnatario. Le preferenze
-- per ruolo le applica send-push-notification.
CREATE OR REPLACE FUNCTION public.check_maintenance_deadlines()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          RECORD;
  v_cycle    TIMESTAMPTZ;
  v_days     INTEGER;
  v_alert    public.maintenance_alerts%ROWTYPE;
  v_sent     INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.name, p.frequency_days, p.assigned_to, p.org_id,
           p.created_at, p.current_status, m.name AS machine_name,
           (SELECT max(l.performed_at) FROM public.maintenance_logs l WHERE l.plan_id = p.id) AS last_done
      FROM public.maintenance_plans p
      JOIN public.machines m ON m.id = p.machine_id
     WHERE COALESCE(p.frequency_days, 0) > 0
  LOOP
    v_cycle := COALESCE(r.last_done, r.created_at);
    v_days  := r.frequency_days - floor(extract(epoch FROM (now() - v_cycle)) / 86400)::int;

    IF v_days > 0 AND v_days <= 5 THEN
      INSERT INTO public.maintenance_alerts (plan_id, kind, cycle_start, org_id)
      VALUES (r.id, 'reminder', v_cycle, r.org_id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        INSERT INTO public.notifications (type, title, body, report_id, from_user, target_user, org_id)
        VALUES ('maintenance_reminder',
                '🔔 Manutenzione in scadenza: ' || r.name,
                r.machine_name || ' — scade tra ' || v_days || ' giorn' || CASE WHEN v_days = 1 THEN 'o' ELSE 'i' END || '. Pianifica l''intervento.',
                NULL, NULL, r.assigned_to, r.org_id);
        v_sent := v_sent + 1;
      END IF;

    ELSIF v_days <= 0 THEN
      SELECT * INTO v_alert FROM public.maintenance_alerts
       WHERE plan_id = r.id AND kind = 'overdue' AND cycle_start = v_cycle;

      IF NOT FOUND THEN
        INSERT INTO public.maintenance_alerts (plan_id, kind, cycle_start, org_id)
        VALUES (r.id, 'overdue', v_cycle, r.org_id);
      ELSIF r.current_status IS DISTINCT FROM 'in_corso'
            -- un'ora di margine: il job gira ogni giorno alla stessa ora
            AND v_alert.last_sent_at <= now() - interval '3 days' + interval '1 hour' THEN
        UPDATE public.maintenance_alerts
           SET last_sent_at = now(), times_sent = times_sent + 1
         WHERE plan_id = r.id AND kind = 'overdue' AND cycle_start = v_cycle;
      ELSE
        CONTINUE;
      END IF;

      INSERT INTO public.notifications (type, title, body, report_id, from_user, target_user, org_id)
      VALUES ('maintenance_overdue',
              '⚠️ Manutenzione scaduta: ' || r.name,
              r.machine_name || ' — '
                || CASE WHEN v_days = 0 THEN 'scade oggi' ELSE 'scaduta da ' || abs(v_days) || ' giorn' || CASE WHEN abs(v_days) = 1 THEN 'o' ELSE 'i' END END
                || '. Registra l''intervento quando è fatto.',
              NULL, NULL, r.assigned_to, r.org_id);
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$;


-- ─── 3. Partenza senza raffica ────────────────────────────────
-- Le scadenze già in corso oggi sono state appena segnalate dai
-- telefoni: le si registra come "inviate adesso", così domattina non
-- arriva a tutti un push per ogni piano scaduto. Il primo richiamo
-- degli scaduti arriva fra 3 giorni.
INSERT INTO public.maintenance_alerts (plan_id, kind, cycle_start, org_id)
SELECT p.id,
       CASE WHEN d.days_left <= 0 THEN 'overdue' ELSE 'reminder' END,
       d.cycle_start, p.org_id
  FROM public.maintenance_plans p
  CROSS JOIN LATERAL (
    SELECT COALESCE((SELECT max(l.performed_at) FROM public.maintenance_logs l WHERE l.plan_id = p.id), p.created_at) AS cycle_start
  ) c
  CROSS JOIN LATERAL (
    SELECT c.cycle_start,
           p.frequency_days - floor(extract(epoch FROM (now() - c.cycle_start)) / 86400)::int AS days_left
  ) d
 WHERE COALESCE(p.frequency_days, 0) > 0
   AND d.days_left <= 5
ON CONFLICT DO NOTHING;


-- ─── 4. Ogni mattina alle 06:45 (ora italiana estiva) ─────────
-- pg_cron ragiona in UTC: 04:45 UTC = 06:45 CEST, 05:45 CET in inverno.
-- cron.schedule con lo stesso nome sostituisce il job esistente.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'maintenance-deadlines',
  '45 4 * * *',
  $$SELECT public.check_maintenance_deadlines()$$
);

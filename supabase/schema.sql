-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ManuTech — Schema Database Completo v4.0                  ║
-- ║                                                            ║
-- ║  ISTRUZIONI:                                               ║
-- ║  1. Vai su Supabase Dashboard → SQL Editor                 ║
-- ║  2. Clicca "New Query"                                     ║
-- ║  3. Incolla TUTTO questo file                              ║
-- ║  4. Clicca "Run" (▶)                                       ║
-- ║                                                            ║
-- ║  Questo crea: 10 tabelle, indici, trigger, RLS, storage    ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. TABELLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── USERS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL DEFAULT 'operatore'
              CHECK (role IN ('operatore', 'tecnico', 'admin')),
  org_id      TEXT NOT NULL DEFAULT 'default',
  avatar_url  TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── MACHINES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.machines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  department  TEXT,
  description TEXT,
  location    TEXT,
  status      TEXT DEFAULT 'attivo'
              CHECK (status IN ('attivo', 'in_manutenzione', 'fuori_servizio', 'dismessa')),
  model       TEXT,
  serial_number TEXT,
  manufacturer TEXT,
  year        INTEGER,
  criticality TEXT DEFAULT 'media'
              CHECK (criticality IN ('alta', 'media', 'bassa')),
  notes       TEXT,
  qr_code     TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  sort_order  INTEGER DEFAULT 0,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── REPORTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  severity        TEXT NOT NULL DEFAULT 'media'
                  CHECK (severity IN ('bassa', 'media', 'alta', 'critica')),
  status          TEXT NOT NULL DEFAULT 'aperta'
                  CHECK (status IN ('aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso')),
  type            TEXT NOT NULL DEFAULT 'correttiva'
                  CHECK (type IN ('correttiva', 'preventiva', 'migliorativa', 'ispezione')),
  machine         TEXT,
  machine_id      UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  media           JSONB DEFAULT '[]'::jsonb,
  created_by      UUID REFERENCES public.users(id),
  created_by_name TEXT,
  assigned_to     UUID REFERENCES public.users(id),
  assigned_to_name TEXT,
  is_quick        BOOLEAN DEFAULT false,
  template_id     TEXT,
  extra_data      JSONB,
  -- Campi chiusura intervento (compilati dal tecnico alla risoluzione)
  closure_hours   NUMERIC,                    -- Ore lavoro
  closure_parts   TEXT,                       -- Ricambi utilizzati
  closure_root_cause TEXT,                    -- Causa radice
  closure_action  TEXT,                       -- Azione correttiva
  closed_at       TIMESTAMPTZ,               -- Data chiusura effettiva
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── COMMENTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  user_id     UUID REFERENCES public.users(id),
  user_name   TEXT,
  user_role   TEXT,
  media       JSONB DEFAULT NULL,              -- Allegati chat: [{type, url, name}]
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── ACTIVITIES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  detail      TEXT,
  user_id     UUID REFERENCES public.users(id),
  user_name   TEXT,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── NOTIFICATIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  report_id   UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  from_user   UUID REFERENCES public.users(id),
  target_user UUID REFERENCES public.users(id),
  read        BOOLEAN DEFAULT false,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ── MAINTENANCE PLANS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  frequency_days  INTEGER NOT NULL DEFAULT 30,
  assigned_to     UUID REFERENCES public.users(id),
  instructions    TEXT,
  current_status  TEXT DEFAULT 'da_eseguire'
                  CHECK (current_status IN ('da_eseguire', 'in_corso', 'completata')),
  taken_by        UUID REFERENCES public.users(id),
  taken_by_name   TEXT,
  taken_at        TIMESTAMPTZ,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── MAINTENANCE LOGS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  plan_id         UUID REFERENCES public.maintenance_plans(id) ON DELETE SET NULL,
  type            TEXT NOT NULL DEFAULT 'programmata',
  title           TEXT NOT NULL,
  description     TEXT,
  performed_by    UUID REFERENCES public.users(id),
  performed_by_name TEXT,
  duration_minutes INTEGER,
  parts_replaced  TEXT,
  media           JSONB DEFAULT '[]'::jsonb,
  performed_at    TIMESTAMPTZ DEFAULT now(),
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── PUSH SUBSCRIPTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- ── NOTIFICATION PREFERENCES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.users(id) ON DELETE CASCADE,
  role            TEXT,
  prefs           JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_org_default  BOOLEAN DEFAULT false,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- ── GUEST TOKENS (accesso chat senza login) ──────────────────
CREATE TABLE IF NOT EXISTS public.guest_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  enabled     BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES public.users(id),
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. INDICI
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_users_auth       ON public.users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_org        ON public.users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email      ON public.users(email);

CREATE INDEX IF NOT EXISTS idx_machines_org     ON public.machines(org_id);

CREATE INDEX IF NOT EXISTS idx_reports_status   ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_severity ON public.reports(severity);
CREATE INDEX IF NOT EXISTS idx_reports_created_by  ON public.reports(created_by);
CREATE INDEX IF NOT EXISTS idx_reports_assigned_to ON public.reports(assigned_to);
CREATE INDEX IF NOT EXISTS idx_reports_org      ON public.reports(org_id);
CREATE INDEX IF NOT EXISTS idx_reports_created  ON public.reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_type     ON public.reports(type);

CREATE INDEX IF NOT EXISTS idx_comments_report  ON public.comments(report_id);

CREATE INDEX IF NOT EXISTS idx_mplans_machine   ON public.maintenance_plans(machine_id);
CREATE INDEX IF NOT EXISTS idx_mplans_org       ON public.maintenance_plans(org_id);
CREATE INDEX IF NOT EXISTS idx_mplans_status    ON public.maintenance_plans(current_status);

CREATE INDEX IF NOT EXISTS idx_mlogs_machine    ON public.maintenance_logs(machine_id);
CREATE INDEX IF NOT EXISTS idx_mlogs_plan       ON public.maintenance_logs(plan_id);
CREATE INDEX IF NOT EXISTS idx_mlogs_performed  ON public.maintenance_logs(performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pushsub_user     ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifpref_user   ON public.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_report ON public.activities(report_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON public.activities(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_target     ON public.notifications(target_user);
CREATE INDEX IF NOT EXISTS idx_notif_unread     ON public.notifications(read) WHERE NOT read;
CREATE INDEX IF NOT EXISTS idx_notif_created    ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guest_token      ON public.guest_tokens(token);
CREATE INDEX IF NOT EXISTS idx_guest_report     ON public.guest_tokens(report_id);


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. TRIGGER — updated_at automatico
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON public.users;
CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_reports_updated ON public.reports;
CREATE TRIGGER trg_reports_updated
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_machines_updated ON public.machines;
CREATE TRIGGER trg_machines_updated
  BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


DROP TRIGGER IF EXISTS trg_mplans_updated ON public.maintenance_plans;
CREATE TRIGGER trg_mplans_updated
  BEFORE UPDATE ON public.maintenance_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_mlogs_updated ON public.maintenance_logs;
CREATE TRIGGER trg_mlogs_updated
  BEFORE UPDATE ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_notifpref_updated ON public.notification_preferences;
CREATE TRIGGER trg_notifpref_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. HELPER FUNCTIONS per RLS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Restituisce l'org_id dell'utente loggato
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS TEXT AS $$
  SELECT org_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Restituisce il role dell'utente loggato
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Restituisce l'id (tabella users) dell'utente loggato
CREATE OR REPLACE FUNCTION public.get_my_user_id()
RETURNS UUID AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. ROW LEVEL SECURITY — Policies
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── USERS ──
-- Stessa organizzazione: lettura
CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

-- Registrazione: solo se auth_id corrisponde
CREATE POLICY "users_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth_id = auth.uid());

-- Aggiornamento: solo il proprio profilo, oppure admin
CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid() OR public.get_my_role() = 'admin');

-- Eliminazione: solo admin
CREATE POLICY "users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin' AND org_id = public.get_my_org_id());


-- ── MACHINES ──
CREATE POLICY "machines_select" ON public.machines
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "machines_insert" ON public.machines
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

CREATE POLICY "machines_update" ON public.machines
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

CREATE POLICY "machines_delete" ON public.machines
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');


-- ── REPORTS ──
CREATE POLICY "reports_select" ON public.reports
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "reports_insert" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());

-- Operatori aggiornano solo i propri, tecnici/admin tutti
CREATE POLICY "reports_update" ON public.reports
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (
      created_by = public.get_my_user_id()
      OR public.get_my_role() IN ('tecnico', 'admin')
    )
  );


-- ── COMMENTS ──
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "comments_insert" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());


-- ── ACTIVITIES ──
CREATE POLICY "activities_select" ON public.activities
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "activities_insert" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());


-- ── NOTIFICATIONS ──
-- Vedi solo le tue o quelle broadcast
CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (target_user = public.get_my_user_id() OR target_user IS NULL)
  );

CREATE POLICY "notif_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());

-- Segna come lette solo le proprie
CREATE POLICY "notif_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    target_user = public.get_my_user_id() OR target_user IS NULL
  );


-- ── MAINTENANCE PLANS ──
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mplans_select" ON public.maintenance_plans
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "mplans_insert" ON public.maintenance_plans
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mplans_update" ON public.maintenance_plans
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mplans_delete" ON public.maintenance_plans
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');


-- ── MAINTENANCE LOGS ──
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mlogs_select" ON public.maintenance_logs
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "mlogs_insert" ON public.maintenance_logs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());

CREATE POLICY "mlogs_update" ON public.maintenance_logs
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mlogs_delete" ON public.maintenance_logs
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');


-- ── PUSH SUBSCRIPTIONS ──
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pushsub_select" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = public.get_my_user_id());

CREATE POLICY "pushsub_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "pushsub_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = public.get_my_user_id());


-- ── NOTIFICATION PREFERENCES ──
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifpref_select" ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "notifpref_insert" ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());

CREATE POLICY "notifpref_update" ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND (user_id = public.get_my_user_id() OR public.get_my_role() = 'admin'));

CREATE POLICY "notifpref_delete" ON public.notification_preferences
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND (user_id = public.get_my_user_id() OR public.get_my_role() = 'admin'));


-- ── GUEST TOKENS RLS ──────────────────────────────────────────
ALTER TABLE public.guest_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_tokens_select" ON public.guest_tokens
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "guest_tokens_insert" ON public.guest_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'tecnico')
  );

CREATE POLICY "guest_tokens_update" ON public.guest_tokens
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

CREATE POLICY "guest_tokens_delete" ON public.guest_tokens
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. STORAGE — Bucket per allegati media
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "attach_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "attach_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'attachments');

CREATE POLICY "attach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attachments');


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. AUTO-CREATE USER PROFILE on Auth signup
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Quando un utente si registra via Auth, crea automaticamente
-- il profilo nella tabella users con ruolo 'operatore'.
-- L'admin potrà poi cambiare il ruolo dalla dashboard.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, name, role, org_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operatore'),
    COALESCE(NEW.raw_user_meta_data->>'org_id', 'default')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rimuovi trigger se esiste e ricrea
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. REALTIME — Abilita notifiche istantanee
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Aggiungi tabelle alla pubblicazione realtime di Supabase
-- Questo permette ai client di ricevere INSERT/UPDATE/DELETE in tempo reale
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;


-- ── CONVERSATIONS (Chat Diretta 1-a-1) ─────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_2   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_text TEXT,
  last_message_at   TIMESTAMPTZ,
  last_message_by   UUID REFERENCES public.users(id),
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(participant_1, participant_2)
);

-- ── DIRECT MESSAGES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.users(id),
  sender_name     TEXT,
  sender_role     TEXT,
  text            TEXT NOT NULL,
  media           JSONB DEFAULT NULL,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── DM READS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_p1        ON public.conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_conv_p2        ON public.conversations(participant_2);
CREATE INDEX IF NOT EXISTS idx_conv_org       ON public.conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conv_last_msg  ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON public.direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_created      ON public.direct_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_reads_user   ON public.dm_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_reads_conv   ON public.dm_reads(conversation_id);

DROP TRIGGER IF EXISTS trg_conv_updated ON public.conversations;
CREATE TRIGGER trg_conv_updated
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conv_select" ON public.conversations
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id()));

CREATE POLICY "conv_insert" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id()));

CREATE POLICY "conv_update" ON public.conversations
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id()));

CREATE POLICY "dm_select" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() AND conversation_id IN (
    SELECT id FROM public.conversations WHERE participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id()
  ));

CREATE POLICY "dm_insert" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND sender_id = public.get_my_user_id());

CREATE POLICY "dm_reads_select" ON public.dm_reads
  FOR SELECT TO authenticated USING (user_id = public.get_my_user_id());

CREATE POLICY "dm_reads_upsert" ON public.dm_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "dm_reads_update" ON public.dm_reads
  FOR UPDATE TO authenticated USING (user_id = public.get_my_user_id());

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ✅ SCHEMA COMPLETO — Procedi con SETUP.md
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

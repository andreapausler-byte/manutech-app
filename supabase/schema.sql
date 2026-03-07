-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ManuTech — Schema Database Completo v3.0                  ║
-- ║                                                            ║
-- ║  ISTRUZIONI:                                               ║
-- ║  1. Vai su Supabase Dashboard → SQL Editor                 ║
-- ║  2. Clicca "New Query"                                     ║
-- ║  3. Incolla TUTTO questo file                              ║
-- ║  4. Clicca "Run" (▶)                                       ║
-- ║                                                            ║
-- ║  Questo crea: 6 tabelle, indici, trigger, RLS, storage     ║
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
              CHECK (status IN ('attivo', 'in_manutenzione', 'fuori_servizio')),
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
                  CHECK (status IN ('aperta', 'assegnata', 'in_lavorazione', 'risolta')),
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

CREATE INDEX IF NOT EXISTS idx_comments_report  ON public.comments(report_id);
CREATE INDEX IF NOT EXISTS idx_activities_report ON public.activities(report_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON public.activities(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_target     ON public.notifications(target_user);
CREATE INDEX IF NOT EXISTS idx_notif_unread     ON public.notifications(read) WHERE NOT read;
CREATE INDEX IF NOT EXISTS idx_notif_created    ON public.notifications(created_at DESC);


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
-- ✅ SCHEMA COMPLETO — Procedi con SETUP.md
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

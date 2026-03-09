-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 007 — Push Subscriptions + Notification Prefs  ║
-- ║  Web Push per notifiche in background (Android/iOS)       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── PUSH SUBSCRIPTIONS ───────────────────────────────────────
-- Salva le subscription Web Push per ogni utente/dispositivo
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

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_org  ON public.push_subscriptions(org_id);

-- RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Utenti vedono solo le proprie subscription
CREATE POLICY "push_sub_select" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = public.get_my_user_id());

-- Utenti inseriscono solo per sé stessi
CREATE POLICY "push_sub_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

-- Utenti cancellano solo le proprie
CREATE POLICY "push_sub_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = public.get_my_user_id());

-- Policy per service_role (Edge Function) — accesso completo
-- Le Edge Functions usano la service_role key, che bypassa RLS di default


-- ── NOTIFICATION PREFERENCES ─────────────────────────────────
-- Preferenze notifiche persistite nel DB (migrazione da localStorage)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  role        TEXT CHECK (role IN ('operatore', 'tecnico', 'admin')),
  prefs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_org_default BOOLEAN DEFAULT false,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  -- user_id è NULL per org defaults (is_org_default = true)
  -- user_id è NOT NULL per preferenze personali
  UNIQUE(user_id) -- una riga per utente (preferenze personali)
);

-- Indice per org defaults
CREATE INDEX IF NOT EXISTS idx_notif_prefs_org ON public.notification_preferences(org_id, is_org_default);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON public.notification_preferences(user_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_notif_prefs_updated ON public.notification_preferences;
CREATE TRIGGER trg_notif_prefs_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Tutti vedono i default org della propria org
CREATE POLICY "notif_prefs_select" ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (
      user_id = public.get_my_user_id()
      OR is_org_default = true
    )
  );

-- Utenti inseriscono le proprie preferenze
CREATE POLICY "notif_prefs_insert" ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND (
      (user_id = public.get_my_user_id() AND is_org_default = false)
      OR (is_org_default = true AND public.get_my_role() = 'admin')
    )
  );

-- Utenti aggiornano le proprie, admin aggiorna org defaults
CREATE POLICY "notif_prefs_update" ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (
      user_id = public.get_my_user_id()
      OR (is_org_default = true AND public.get_my_role() = 'admin')
    )
  );

-- Utenti cancellano solo le proprie preferenze personali
CREATE POLICY "notif_prefs_delete" ON public.notification_preferences
  FOR DELETE TO authenticated
  USING (user_id = public.get_my_user_id() AND is_org_default = false);

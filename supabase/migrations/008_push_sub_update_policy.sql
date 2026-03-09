-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 008 — Fix: aggiunge UPDATE policy per          ║
-- ║  push_subscriptions (necessaria per upsert)               ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Senza questa policy, l'upsert in savePushSubscription fallisce
-- silenziosamente perché Supabase upsert richiede sia INSERT che UPDATE.
CREATE POLICY "push_sub_update" ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = public.get_my_user_id())
  WITH CHECK (user_id = public.get_my_user_id());

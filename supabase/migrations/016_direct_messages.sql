-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ManuTech — Migrazione 016: Chat Diretta (DM)             ║
-- ║  Tabelle: conversations, direct_messages, dm_reads         ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── CONVERSATIONS ─────────────────────────────────────────────
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

-- ── DIRECT MESSAGES ───────────────────────────────────────────
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

-- ── DM READS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conv_p1        ON public.conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_conv_p2        ON public.conversations(participant_2);
CREATE INDEX IF NOT EXISTS idx_conv_org       ON public.conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conv_last_msg  ON public.conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_conversation ON public.direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_created      ON public.direct_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_org          ON public.direct_messages(org_id);

CREATE INDEX IF NOT EXISTS idx_dm_reads_user   ON public.dm_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_reads_conv   ON public.dm_reads(conversation_id);

-- ── TRIGGER updated_at ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_conv_updated ON public.conversations;
CREATE TRIGGER trg_conv_updated
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_reads ENABLE ROW LEVEL SECURITY;

-- Conversations: solo partecipanti nella stessa org
CREATE POLICY "conv_select" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id())
  );

CREATE POLICY "conv_insert" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id())
  );

CREATE POLICY "conv_update" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id())
  );

-- Direct messages: solo partecipanti della conversazione
CREATE POLICY "dm_select" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id()
    )
  );

CREATE POLICY "dm_insert" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND sender_id = public.get_my_user_id()
  );

-- DM reads: solo le proprie
CREATE POLICY "dm_reads_select" ON public.dm_reads
  FOR SELECT TO authenticated
  USING (user_id = public.get_my_user_id());

CREATE POLICY "dm_reads_upsert" ON public.dm_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "dm_reads_update" ON public.dm_reads
  FOR UPDATE TO authenticated
  USING (user_id = public.get_my_user_id());

-- ── REALTIME ──────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

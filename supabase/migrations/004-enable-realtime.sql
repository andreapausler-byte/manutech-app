-- ============================================================
-- Sprint 3.6c: Enable Realtime on notifications + comments
-- ============================================================
-- Run this in Supabase SQL Editor if you already have the schema
-- 
-- This enables Supabase Realtime subscriptions so clients
-- receive instant notifications without polling.

-- Enable Realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Enable Realtime for comments table (chat)
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;

-- Verify:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

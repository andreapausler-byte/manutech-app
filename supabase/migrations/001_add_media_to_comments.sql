-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ManuTech — Migration 001                                    ║
-- ║  Aggiunge colonna `media` alla tabella comments              ║
-- ║                                                              ║
-- ║  Esegui in: Supabase Dashboard → SQL Editor → Run            ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Aggiunge supporto media (foto, video, audio) ai commenti chat
-- Formato: JSONB array di { type: 'photo'|'video'|'audio', url: string, name: string }
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS media JSONB DEFAULT NULL;

-- Indice GIN per query su commenti con media (utile per analytics future)
CREATE INDEX IF NOT EXISTS idx_comments_media
ON public.comments USING gin(media)
WHERE media IS NOT NULL;

-- ✅ Migrazione completata

-- Down migration 042 — rollback comment editing
DROP FUNCTION IF EXISTS public.delete_comment(UUID);
DROP FUNCTION IF EXISTS public.update_comment(UUID, TEXT);

DROP POLICY IF EXISTS "comments_delete" ON public.comments;
DROP POLICY IF EXISTS "comments_update" ON public.comments;

ALTER TABLE public.comments
  DROP COLUMN IF EXISTS edited_at,
  DROP COLUMN IF EXISTS original_text,
  DROP COLUMN IF EXISTS edit_history,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS deleted_by;

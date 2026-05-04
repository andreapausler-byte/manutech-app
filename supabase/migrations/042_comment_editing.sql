-- ──────────────────────────────────────────────────────────────────────────
-- Migration 042 — Editing dei commenti chat con storico
-- ──────────────────────────────────────────────────────────────────────────
-- Permette ad autori e admin di correggere il testo dei commenti dopo
-- l'invio (correzione errori ortografici, chiarimenti, integrazioni).
-- L'audio originale e i campi extra_data delle note vocali NON vengono
-- toccati: si modifica solo il testo visibile.
--
-- Aggiunte:
--   edited_at TIMESTAMPTZ        — quando e' stato modificato l'ultima volta
--   original_text TEXT           — il testo prima della prima modifica (audit)
--   edit_history JSONB           — array di {text, edited_at, edited_by_*}
--                                  per tutte le revisioni
--   deleted_at TIMESTAMPTZ       — soft delete (chi cancella un commento)
--   deleted_by TEXT              — nome di chi ha cancellato
--
-- Policy:
--   comments_update — solo autore (user_id = my_user_id) o admin dell'org
--   comments_delete — solo autore o admin (resta il record con deleted_at)
--
-- RPC SECURITY DEFINER:
--   update_comment(_id, _new_text)  — aggiorna text + edit_history + edited_at
--   delete_comment(_id)             — soft delete (deleted_at + deleted_by)

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_text TEXT,
  ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- Policy UPDATE: autore o admin
DROP POLICY IF EXISTS "comments_update" ON public.comments;
CREATE POLICY "comments_update" ON public.comments
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (
      user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
      OR public.get_my_role() = 'admin'
    )
  )
  WITH CHECK (
    org_id = public.get_my_org_id()
  );

-- Policy DELETE: autore o admin (lasciamo HARD delete come fallback,
-- ma preferiamo soft delete via RPC delete_comment)
DROP POLICY IF EXISTS "comments_delete" ON public.comments;
CREATE POLICY "comments_delete" ON public.comments
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (
      user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
      OR public.get_my_role() = 'admin'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- RPC update_comment — aggiorna il testo con storico
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_comment(
  _comment_id UUID,
  _new_text   TEXT
)
RETURNS public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_user_id   UUID;
  v_my_role      TEXT;
  v_my_org_id    TEXT;
  v_my_user_name TEXT;
  v_existing     public.comments%ROWTYPE;
  v_now          TIMESTAMPTZ := now();
  v_history      JSONB;
BEGIN
  IF _new_text IS NULL OR length(trim(_new_text)) = 0 THEN
    RAISE EXCEPTION 'Il testo del commento non può essere vuoto';
  END IF;

  -- Identita' utente corrente
  SELECT id, role, org_id, name
    INTO v_my_user_id, v_my_role, v_my_org_id, v_my_user_name
    FROM public.users
    WHERE auth_id = auth.uid()
    LIMIT 1;

  IF v_my_user_id IS NULL THEN
    RAISE EXCEPTION 'Utente non valido';
  END IF;

  -- Carica il commento
  SELECT * INTO v_existing FROM public.comments WHERE id = _comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commento non trovato';
  END IF;

  -- Autorizzazione: stesso org + (autore o admin)
  IF v_existing.org_id <> v_my_org_id THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF v_existing.user_id <> v_my_user_id AND v_my_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo l''autore o un admin possono modificare il commento';
  END IF;
  IF v_existing.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Impossibile modificare un commento eliminato';
  END IF;

  -- No-op se il testo non cambia
  IF v_existing.text = _new_text THEN
    RETURN v_existing;
  END IF;

  -- Append alla edit_history (testo PRECEDENTE + chi lo cambia)
  v_history := COALESCE(v_existing.edit_history, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'text', v_existing.text,
      'edited_at', COALESCE(v_existing.edited_at, v_existing.created_at),
      'edited_by_id', v_my_user_id,
      'edited_by_name', v_my_user_name,
      'edited_by_role', v_my_role
    ));

  -- Update
  UPDATE public.comments SET
    text = _new_text,
    edited_at = v_now,
    -- original_text settato solo alla PRIMA modifica
    original_text = COALESCE(original_text, v_existing.text),
    edit_history = v_history
  WHERE id = _comment_id
  RETURNING * INTO v_existing;

  RETURN v_existing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_comment(UUID, TEXT) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC delete_comment — soft delete
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_comment(_comment_id UUID)
RETURNS public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_user_id   UUID;
  v_my_role      TEXT;
  v_my_org_id    TEXT;
  v_my_user_name TEXT;
  v_existing     public.comments%ROWTYPE;
BEGIN
  SELECT id, role, org_id, name
    INTO v_my_user_id, v_my_role, v_my_org_id, v_my_user_name
    FROM public.users
    WHERE auth_id = auth.uid()
    LIMIT 1;

  IF v_my_user_id IS NULL THEN
    RAISE EXCEPTION 'Utente non valido';
  END IF;

  SELECT * INTO v_existing FROM public.comments WHERE id = _comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commento non trovato';
  END IF;

  IF v_existing.org_id <> v_my_org_id THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF v_existing.user_id <> v_my_user_id AND v_my_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo l''autore o un admin possono eliminare il commento';
  END IF;

  UPDATE public.comments SET
    deleted_at = now(),
    deleted_by = v_my_user_name
  WHERE id = _comment_id
  RETURNING * INTO v_existing;

  RETURN v_existing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_comment(UUID) TO authenticated;

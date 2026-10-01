-- ╔══════════════════════════════════════════════════════════════╗
-- ║  064 — "Mi è servita": il voto sulla chiusura                 ║
-- ║                                                                ║
-- ║  Una chiusura scritta bene (causa, azione, ricambio esatto)   ║
-- ║  fa risparmiare ore a chi trova lo stesso guasto mesi dopo.   ║
-- ║  Finora nessuno lo sapeva, men che meno chi l'aveva scritta.  ║
-- ║                                                                ║
-- ║  Il voto è una reazione a livello segnalazione (comment_id    ║
-- ║  NULL) di tipo 'servito', nella tabella `reactions` della 059:║
-- ║  stessa RLS, stesso toggle INSERT/DELETE, stesso indice       ║
-- ║  unico che impedisce i doppioni.                              ║
-- ║                                                                ║
-- ║  Il trigger accredita 5 ManuCoin al tecnico della chiusura    ║
-- ║  (reports.assigned_to) — UNA volta per collega: togliere e    ║
-- ║  rimettere il voto non riaccredita (dedup su reference_id),   ║
-- ║  e il proprio voto sulla propria chiusura non conta. Sta qui  ║
-- ║  e non nel client perché il client potrebbe ripeterlo.        ║
-- ║                                                                ║
-- ║  Applica:                                                     ║
-- ║   - reactions.type accetta 'servito'                          ║
-- ║   - trigger reward_helpful_closure su INSERT                  ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ─── 1. Il nuovo tipo di reazione ─────────────────────────────
-- Il CHECK inline della 059 prende il nome di default
-- reactions_type_check.
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_type_check;
ALTER TABLE public.reactions ADD CONSTRAINT reactions_type_check
  CHECK (type IN ('utile', 'confermo', 'risolto', 'grazie', 'servito'));


-- ─── 2. Il riconoscimento ─────────────────────────────────────
-- Passa da credit_tokens (018): stesso calcolo del saldo e stesso
-- hash del registro. Gira nella sessione di chi vota, e credit_tokens
-- consente 'earn' a qualunque ruolo.
CREATE OR REPLACE FUNCTION public.reward_helpful_closure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_closer UUID;
  v_title  TEXT;
  v_ref    TEXT;
BEGIN
  IF NEW.type <> 'servito' OR NEW.comment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT assigned_to, title INTO v_closer, v_title
    FROM public.reports WHERE id = NEW.report_id;

  -- Nessun tecnico da ringraziare, o voto sulla propria chiusura.
  IF v_closer IS NULL OR v_closer = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_ref := NEW.report_id::text || ':' || NEW.user_id::text;
  IF EXISTS (
    SELECT 1 FROM public.token_transactions
     WHERE reason_code = 'closure_helpful' AND reference_id = v_ref
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.credit_tokens(
    v_closer,
    5,
    'La tua chiusura è servita a ' || COALESCE(NULLIF(NEW.user_name, ''), 'un collega')
      || COALESCE(' — ' || v_title, ''),
    'closure_helpful',
    v_ref,
    'earn'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reward_helpful_closure ON public.reactions;
CREATE TRIGGER trg_reward_helpful_closure
  AFTER INSERT ON public.reactions
  FOR EACH ROW EXECUTE FUNCTION public.reward_helpful_closure();

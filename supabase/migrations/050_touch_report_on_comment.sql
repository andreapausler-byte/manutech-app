-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 050: touch reports.updated_at su attività comments║
-- ║                                                                ║
-- ║  Problema: la lista segnalazioni ordina per reports.updated_at ║
-- ║  desc, ma updated_at sale solo su UPDATE diretto del record.  ║
-- ║  L'inserimento di un commento (= INSERT su comments) non       ║
-- ║  toccava reports.updated_at: ticket vivi restavano in basso    ║
-- ║  in lista nonostante l'attività in chat.                       ║
-- ║                                                                ║
-- ║  Fix: trigger AFTER INSERT/UPDATE su comments che propaga      ║
-- ║  updated_at = now() al report associato. Riallinea l'ordine    ║
-- ║  in lista alla percezione "ticket attivo".                     ║
-- ╚══════════════════════════════════════════════════════════════╝


CREATE OR REPLACE FUNCTION public.touch_report_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo se il commento riguarda un report esistente (FK è ON DELETE
  -- CASCADE, quindi se il report sparisce sparisce anche il commento
  -- e il trigger non scatta).
  IF NEW.report_id IS NOT NULL THEN
    UPDATE public.reports
    SET updated_at = now()
    WHERE id = NEW.report_id;
  END IF;
  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_touch_report_on_comment ON public.comments;

CREATE TRIGGER trg_touch_report_on_comment
AFTER INSERT OR UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.touch_report_on_comment();

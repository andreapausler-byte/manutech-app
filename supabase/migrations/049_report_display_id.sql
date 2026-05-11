-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 049: TK display_id basato su giorno giuliano       ║
-- ║                                                                ║
-- ║  Sostituisce lo schema TK-XXXX (derivato dalle ultime 4 cifre ║
-- ║  numeriche dell'UUID) con uno informativo:                    ║
-- ║    TK-YYJJJ-NN                                                ║
-- ║      YY  = anno a 2 cifre del created_at                      ║
-- ║      JJJ = giorno giuliano (1-366), zero-padded               ║
-- ║      NN  = sequenziale per (org_id, giorno), 2 cifre se <100  ║
-- ║                                                                ║
-- ║  Esempio: 9 maggio 2026, primo ticket org X → TK-26129-01     ║
-- ║                                                                ║
-- ║  Applica:                                                     ║
-- ║   - ALTER reports ADD display_id TEXT                         ║
-- ║   - Funzione + trigger BEFORE INSERT che genera display_id    ║
-- ║   - Backfill retroattivo dei ticket esistenti                 ║
-- ║   - Indice UNIQUE su (org_id, display_id)                     ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ─── 1. Colonna ────────────────────────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS display_id TEXT;


-- ─── 2. Funzione che genera display_id ─────────────────────────
-- Usa pg_advisory_xact_lock su (org_id, day) per evitare race
-- condition tra INSERT simultanei (2 utenti, stesso org, stesso
-- giorno: senza lock potrebbero ottenere lo stesso seq).

CREATE OR REPLACE FUNCTION public.compute_report_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_year_2 TEXT;
  v_julian TEXT;
  v_seq    INT;
  v_lock_key BIGINT;
BEGIN
  IF NEW.display_id IS NOT NULL AND NEW.display_id <> '' THEN
    RETURN NEW;
  END IF;

  -- created_at è settato di default a now() se non passato esplicitamente
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  v_year_2 := to_char(NEW.created_at, 'YY');
  v_julian := to_char(NEW.created_at, 'DDD');

  -- Lock per evitare race su (org_id, day): se 2 INSERT arrivano insieme
  -- con stesso org+day, il secondo aspetta che il primo abbia inserito.
  v_lock_key := hashtextextended(coalesce(NEW.org_id, '') || '|' || v_year_2 || v_julian, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Conta i report già presenti per quell'org in quel giorno + 1
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.reports
  WHERE org_id = NEW.org_id
    AND to_char(created_at, 'YY') = v_year_2
    AND to_char(created_at, 'DDD') = v_julian;

  -- Padding: 01-99 a 2 cifre, oltre senza pad (>99 è caso limite,
  -- preferiamo non rompere il formato standard per ID brevi)
  NEW.display_id := 'TK-' || v_year_2 || v_julian || '-' ||
    CASE WHEN v_seq < 100
         THEN lpad(v_seq::text, 2, '0')
         ELSE v_seq::text
    END;

  RETURN NEW;
END;
$$;


-- ─── 3. Trigger BEFORE INSERT ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_set_report_display_id ON public.reports;

CREATE TRIGGER trg_set_report_display_id
BEFORE INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.compute_report_display_id();


-- ─── 4. Backfill retroattivo dei ticket esistenti ──────────────
-- Per ogni org+giorno, ordina per created_at ASC (poi id come tiebreak)
-- e assegna seq incrementale. ROW_NUMBER è atomico in una singola query.

WITH numbered AS (
  SELECT
    id,
    org_id,
    to_char(created_at, 'YY')  AS yy,
    to_char(created_at, 'DDD') AS jjj,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, to_char(created_at, 'YY') || to_char(created_at, 'DDD')
      ORDER BY created_at, id
    ) AS seq
  FROM public.reports
  WHERE display_id IS NULL OR display_id = ''
)
UPDATE public.reports r
SET display_id = 'TK-' || n.yy || n.jjj || '-' ||
  CASE WHEN n.seq < 100
       THEN lpad(n.seq::text, 2, '0')
       ELSE n.seq::text
  END
FROM numbered n
WHERE r.id = n.id;


-- ─── 5. Vincoli ────────────────────────────────────────────────
-- NOT NULL dopo il backfill (tutti i record adesso hanno un valore)
ALTER TABLE public.reports
  ALTER COLUMN display_id SET NOT NULL;

-- UNIQUE per (org_id, display_id): garantisce che due ticket nella stessa
-- org non possano avere lo stesso display_id. Cross-org collisions ok
-- (org A e org B possono avere entrambe TK-26129-01).
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_display_id_org
  ON public.reports(org_id, display_id);

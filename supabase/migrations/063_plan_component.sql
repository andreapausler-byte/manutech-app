-- ╔══════════════════════════════════════════════════════════════╗
-- ║  063 — La manutenzione programmata può nominare il pezzo      ║
-- ║                                                                ║
-- ║  Una linea di imbottigliamento non si lubrifica "in generale": ║
-- ║  si ingrassano i cuscinetti del tappatore e si cambia il       ║
-- ║  filtro della sciacquatrice. Finora il piano poteva dirlo solo ║
-- ║  nel nome, cioè da nessuna parte.                              ║
-- ║                                                                ║
-- ║  Qui il piano prende un `component_id` OPZIONALE. Il piano     ║
-- ║  resta della macchina: scadenze, semaforo e agenda non         ║
-- ║  cambiano di una riga. Cambia solo che il log confermato       ║
-- ║  eredita il pezzo, e lo storico del componente si popola da    ║
-- ║  solo (studio 2026-08-26, §C e §5).                            ║
-- ║                                                                ║
-- ║  Applica:                                                     ║
-- ║   - maintenance_plans.component_id + indice                   ║
-- ║   - create_maintenance_plan() accetta e VERIFICA il pezzo      ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ─── 1. La colonna ────────────────────────────────────────────
-- ON DELETE SET NULL e non CASCADE: smontare la pompa non deve
-- cancellare il piano di manutenzione della linea. Il piano resta,
-- perde il riferimento al pezzo — stesso principio dei file in 062.
ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS component_id UUID DEFAULT NULL
  REFERENCES public.machine_components(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mplans_component
  ON public.maintenance_plans(component_id)
  WHERE component_id IS NOT NULL;


-- ─── 2. RPC di creazione piano ────────────────────────────────
-- La 017 aveva sei parametri. Aggiungerne uno con DEFAULT crea un
-- OVERLOAD, e PostgREST non saprebbe più quale chiamare ("function
-- is not unique"): la vecchia va tolta prima.
DROP FUNCTION IF EXISTS public.create_maintenance_plan(UUID, TEXT, INTEGER, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_maintenance_plan(
  _machine_id UUID,
  _name TEXT,
  _frequency_days INTEGER DEFAULT 30,
  _assigned_to UUID DEFAULT NULL,
  _assigned_to_name TEXT DEFAULT NULL,
  _instructions TEXT DEFAULT NULL,
  _component_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _result JSONB;
BEGIN
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Profilo utente non trovato';
  END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Permesso negato: ruolo % non autorizzato', _role;
  END IF;

  -- Il pezzo deve essere di QUESTA macchina e di questa org. Un piano
  -- appeso al componente di un'altra linea è un piano che nessuno
  -- troverà mai: meglio rifiutarlo qui che scoprirlo in officina.
  IF _component_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.machine_components c
       WHERE c.id = _component_id
         AND c.machine_id = _machine_id
         AND c.org_id = _org_id
    ) THEN
      RAISE EXCEPTION 'Componente non valido per questo macchinario';
    END IF;
  END IF;

  INSERT INTO public.maintenance_plans (
    machine_id, name, frequency_days, assigned_to, assigned_to_name,
    instructions, component_id, org_id
  ) VALUES (
    _machine_id, _name, _frequency_days, _assigned_to, _assigned_to_name,
    _instructions, _component_id, _org_id
  )
  RETURNING to_jsonb(maintenance_plans.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

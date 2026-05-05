-- Down migration 044 — torna alla logica della 043 (filtro role='supplier' only).
-- Non perdi dati: la RPC e' una funzione, la sua "vecchia" versione viene
-- ripristinata identica alla 043.

CREATE OR REPLACE FUNCTION public.get_assistant_suppliers_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_role   TEXT;
  v_result JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  v_role   := public.get_my_role();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Org non disponibile';
  END IF;
  IF v_role NOT IN ('admin', 'tecnico', 'super_admin') THEN
    RAISE EXCEPTION 'Accesso riservato a tecnici e admin';
  END IF;

  WITH supplier_users AS (
    SELECT u.id AS user_id, COALESCE(sp.company_name, u.name) AS supplier_name,
           sp.referent_name, sp.specialties, sp.city, u.status AS user_status
    FROM public.users u
    LEFT JOIN public.supplier_profiles sp ON sp.user_id = u.id
    WHERE u.org_id = v_org_id AND u.role = 'supplier'
  )
  SELECT jsonb_agg(jsonb_build_object('supplier_name', supplier_name))
  INTO v_result FROM supplier_users;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

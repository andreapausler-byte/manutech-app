-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 030: Anagrafica estesa fornitori esterni
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Tabella separata supplier_profiles (1-a-1 con users) per evitare
-- di appesantire users con 20+ colonne usate solo dai fornitori.

CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  user_id          UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,

  -- Anagrafica
  company_name     TEXT NOT NULL,
  referent_name    TEXT,
  vat_number       TEXT,
  tax_code         TEXT,

  -- Contatti
  phone            TEXT,
  whatsapp         TEXT,
  email_public     TEXT,

  -- Operatività
  specialties      TEXT[] DEFAULT ARRAY[]::TEXT[],
  city             TEXT,
  availability     TEXT CHECK (availability IN ('feriali', 'h24', 'weekend', 'su_chiamata')),

  -- Commerciale
  hourly_rate      NUMERIC(10,2),
  notes            TEXT,

  -- Opzionali / futuri
  address          TEXT,
  website          TEXT,
  admin_contact    TEXT,
  iban             TEXT,
  certifications   JSONB DEFAULT '[]'::JSONB,
  equipment        TEXT[] DEFAULT ARRAY[]::TEXT[],
  rating           NUMERIC(3,2) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  photo_url        TEXT,
  metadata         JSONB DEFAULT '{}'::JSONB,

  org_id           TEXT NOT NULL DEFAULT 'default',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_profiles_org ON public.supplier_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_supplier_profiles_specialties ON public.supplier_profiles USING GIN(specialties);
CREATE INDEX IF NOT EXISTS idx_supplier_profiles_city ON public.supplier_profiles(city);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.supplier_profiles_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_profiles_updated ON public.supplier_profiles;
CREATE TRIGGER trg_supplier_profiles_updated
  BEFORE UPDATE ON public.supplier_profiles
  FOR EACH ROW EXECUTE FUNCTION public.supplier_profiles_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;

-- Admin: full access nell'organizzazione
CREATE POLICY "sp_admin_all" ON public.supplier_profiles
  FOR ALL TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin')
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- Fornitore: vede e aggiorna solo il proprio profilo
CREATE POLICY "sp_self_select" ON public.supplier_profiles
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id() AND
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "sp_self_update" ON public.supplier_profiles
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id() AND
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Tecnici/operatori: read-only (per mostrare info fornitore assegnato su report)
CREATE POLICY "sp_read_assigned" ON public.supplier_profiles
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

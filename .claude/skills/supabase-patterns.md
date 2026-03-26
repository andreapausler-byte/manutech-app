# Skill: Pattern Supabase per ManuTech

## Pattern base: Query con demo fallback

Ogni funzione in `src/lib/supabase.js` segue questo schema:

```js
async nomeMetodo(params) {
  if (supabase) {
    const { data, error } = await supabase
      .from('tabella')
      .select('*')
      .eq('org_id', await getMyOrgId())
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }
  // Demo mode: localStorage
  const items = JSON.parse(localStorage.getItem('manutech_tabella') || '[]')
  return items.filter(i => /* filtri equivalenti */)
}
```

## Insert sicure con RPC

Per tabelle con RLS complessa, NON usare `.from().insert()`. Crea una RPC:

```sql
-- Migration file: supabase/migrations/0XX_nome.sql
CREATE OR REPLACE FUNCTION public.create_nome(
  _param1 UUID,
  _param2 TEXT
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _result JSONB;
BEGIN
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN RAISE EXCEPTION 'Non autorizzato'; END IF;

  INSERT INTO public.tabella (param1, param2, org_id)
  VALUES (_param1, _param2, _org_id)
  RETURNING to_jsonb(tabella.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Lato JS:
```js
async createNome(params) {
  if (supabase) {
    // Prova RPC
    const { data, error } = await supabase.rpc('create_nome', {
      _param1: params.param1,
      _param2: params.param2,
    })
    if (!error && data) return data
    // Fallback insert diretto
    if (error) console.warn('[ManuTech] RPC non disponibile, fallback:', error.message)
    const insertData = { ...params, org_id: await getMyOrgId() }
    const { data: d, error: e } = await supabase.from('tabella').insert(insertData).select().single()
    if (e) throw e
    return d
  }
  // Demo
  const items = JSON.parse(localStorage.getItem('manutech_tabella') || '[]')
  const item = { ...params, id: `item-${Date.now()}`, created_at: new Date().toISOString() }
  items.unshift(item)
  localStorage.setItem('manutech_tabella', JSON.stringify(items))
  return item
}
```

## RLS Policy standard

```sql
ALTER TABLE public.tabella ENABLE ROW LEVEL SECURITY;

-- Tutti dell'org leggono
CREATE POLICY "tabella_select" ON public.tabella
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

-- Solo admin/tecnico inseriscono
CREATE POLICY "tabella_insert" ON public.tabella
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

-- Solo admin/tecnico aggiornano
CREATE POLICY "tabella_update" ON public.tabella
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

-- Solo admin cancella
CREATE POLICY "tabella_delete" ON public.tabella
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
```

## Realtime subscriptions

```js
useEffect(() => {
  if (!supabase) return
  const channel = supabase
    .channel('nome-channel')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tabella',
      filter: `org_id=eq.${orgId}`,
    }, (payload) => {
      // Handle INSERT, UPDATE, DELETE
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [orgId])
```

## Migration naming
File: `supabase/migrations/0XX_descrizione_breve.sql`
Numerazione sequenziale. Controlla l'ultimo numero in `supabase/migrations/`.

## Funzioni helper SQL esistenti
- `public.get_my_org_id()` → TEXT (SECURITY DEFINER, STABLE)
- `public.get_my_role()` → TEXT (SECURITY DEFINER, STABLE)
- `public.resolve_my_profile(...)` → profile upsert
- `public.create_maintenance_plan(...)` → insert piano
- `public.credit_tokens(...)` → accredito ManuCoin
- `public.redeem_reward(...)` → riscatto premio
- `public.get_token_balance(...)` → saldo utente

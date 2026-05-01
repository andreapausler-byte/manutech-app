import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase non configurato. Crea un file .env con:\n' +
    'VITE_SUPABASE_URL=https://tuoprogetto.supabase.co\n' +
    'VITE_SUPABASE_ANON_KEY=la_tua_chiave_anon\n\n' +
    'Per ora l\'app userà la modalità demo (localStorage).'
  )
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const isSupabaseConfigured = () => !!supabase

// Org_id di fallback usato solo in demo mode (localStorage, no Supabase).
export const DEMO_ORG_ID = 'demo-org'

let _cachedOrgId = null

export async function getMyOrgId() {
  if (_cachedOrgId) return _cachedOrgId
  if (!supabase) return DEMO_ORG_ID
  const { data } = await supabase.rpc('get_my_org_id')
  _cachedOrgId = data || null
  return _cachedOrgId
}

export function resetOrgIdCache() {
  _cachedOrgId = null
}

if (supabase) {
  supabase.auth.onAuthStateChange(() => { _cachedOrgId = null })
}

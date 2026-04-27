import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

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

// ── Cache org_id per evitare query ripetute ──
let _cachedOrgId = null
async function getMyOrgId() {
  if (_cachedOrgId) return _cachedOrgId
  if (!supabase) return 'default'
  const { data } = await supabase.rpc('get_my_org_id')
  _cachedOrgId = data || 'default'
  return _cachedOrgId
}
// Reset cache on auth state change (login/logout)
if (supabase) {
  supabase.auth.onAuthStateChange(() => { _cachedOrgId = null })
}

// ── Modalità Demo (localStorage) ─────────────────────────
// Usata come fallback quando Supabase non è configurato
// Permette di testare l'app senza backend

const KEYS = {
  users: 'manutech_users',
  reports: 'manutech_reports',
  machines: 'manutech_machines',
  session: 'manutech_session',
  comments: 'manutech_comments',
  activities: 'manutech_activities',
  notifications: 'manutech_notifications',
}

function getStore(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') }
  catch (e) { console.warn(`[ManuTech] Dati corrotti in localStorage (${key}):`, e.message); return [] }
}

function setStore(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
}

// Assicura che esista un admin di default
export function ensureDefaultAdmin() {
  const users = getStore(KEYS.users)
  if (!users.find(u => u.role === 'admin')) {
    users.push({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@manutech.it',
      password: 'admin123',
      role: 'admin',
      status: 'active',
      created_at: new Date().toISOString(),
    })
    setStore(KEYS.users, users)
  }
  // Ensure demo users exist for testing messaging
  const updated = getStore(KEYS.users)
  const demoUsers = [
    { id: 'tecnico-1', name: 'Marco Rossi', email: 'marco@manutech.it', password: 'demo123', role: 'tecnico', status: 'active', created_at: new Date().toISOString() },
    { id: 'operatore-1', name: 'Luca Bianchi', email: 'luca@manutech.it', password: 'demo123', role: 'operatore', status: 'active', created_at: new Date().toISOString() },
  ]
  let changed = false
  for (const du of demoUsers) {
    if (!updated.find(u => u.id === du.id)) {
      updated.push(du)
      changed = true
    }
  }
  // Retrofit: utenti esistenti senza status → 'active'
  for (const u of updated) {
    if (!u.status) { u.status = 'active'; changed = true }
  }
  if (changed) setStore(KEYS.users, updated)
}

// Demo helper: genera token invito
function demoToken() {
  return 'demo_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ── API unificata (Supabase o localStorage) ──────────────

export const db = {
  // ─── USERS ───
  async getUsers() {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false })
      console.log('[ManuTech] getUsers → supabase:', { count: data?.length, error: error?.message })
      if (error) throw error
      return data || []
    }
    console.log('[ManuTech] getUsers → demo mode (localStorage)')
    return getStore(KEYS.users)
  },

  async createUser(user) {
    if (supabase) {
      const { data, error } = await supabase.from('users').insert(user).select().single()
      if (error) throw error
      return data
    }
    const users = getStore(KEYS.users)
    const newUser = { ...user, id: `user-${Date.now()}`, created_at: new Date().toISOString() }
    users.push(newUser)
    setStore(KEYS.users, users)
    return newUser
  },

  async deleteUser(id) {
    if (supabase) {
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) throw error
      return
    }
    const users = getStore(KEYS.users).filter(u => u.id !== id)
    setStore(KEYS.users, users)
  },

  async updateUser(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('users').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const users = getStore(KEYS.users)
    const idx = users.findIndex(u => u.id === id)
    if (idx === -1) throw new Error('Utente non trovato')
    users[idx] = { ...users[idx], ...updates, updated_at: new Date().toISOString() }
    setStore(KEYS.users, users)
    return users[idx]
  },

  async login(email, password) {
    if (supabase) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError

      // RPC SECURITY DEFINER: cerca/linka profilo bypassando RLS (rifiuta non-active)
      const { data: profile, error: rpcError } = await supabase.rpc('resolve_my_profile')
      if (rpcError) {
        // Logout per evitare sessione orfana se il profilo è rifiutato
        await supabase.auth.signOut()
        throw new Error(rpcError.message)
      }
      if (!profile) throw new Error('Profilo utente non trovato')
      return profile
    }
    const users = getStore(KEYS.users)
    const user = users.find(u => u.email === email && u.password === password)
    if (!user) throw new Error('Credenziali non valide')
    if (user.status && user.status !== 'active') {
      throw new Error(user.status === 'pending'
        ? 'Account in attesa di attivazione'
        : 'Account disabilitato. Contatta l\'amministratore.')
    }
    setStore(KEYS.session, user)
    return user
  },

  // ─── INVITI ───
  async inviteUser({ email, name, role = 'operatore', expiresHours = 168 }) {
    if (supabase) {
      const { data, error } = await supabase.rpc('invite_user', {
        _email: email, _name: name, _role: role, _expires_hours: expiresHours,
      })
      if (error) throw new Error(error.message)
      return data
    }
    const users = getStore(KEYS.users)
    const emailLower = (email || '').trim().toLowerCase()
    if (!emailLower || !name?.trim()) throw new Error('Email e nome obbligatori')
    const existing = users.find(u => u.email?.toLowerCase() === emailLower)
    if (existing && existing.status === 'active') throw new Error('Esiste già un utente attivo con questa email')
    const token = demoToken()
    const expires = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString()
    if (existing) {
      Object.assign(existing, {
        name, role, status: 'pending',
        invite_token: token, invite_expires_at: expires,
        invited_at: new Date().toISOString(), invite_accepted_at: null,
        updated_at: new Date().toISOString(),
      })
      setStore(KEYS.users, users)
      return existing
    }
    const newUser = {
      id: `user-${Date.now()}`, email: emailLower, name, role,
      org_id: 'default', status: 'pending',
      invite_token: token, invite_expires_at: expires,
      invited_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }
    users.push(newUser)
    setStore(KEYS.users, users)
    return newUser
  },

  async getInviteInfo(token) {
    if (supabase) {
      const { data, error } = await supabase.rpc('get_invite_info', { _token: token })
      if (error) throw new Error(error.message)
      return data
    }
    const u = getStore(KEYS.users).find(u => u.invite_token === token)
    if (!u) throw new Error('Invito non valido')
    if (u.status !== 'pending') throw new Error('Invito già utilizzato o revocato')
    if (new Date(u.invite_expires_at) < new Date()) throw new Error('Invito scaduto')
    return { email: u.email, name: u.name, role: u.role, expires_at: u.invite_expires_at }
  },

  async acceptInvite({ token, password }) {
    if (supabase) {
      // Step 1: recupera info invito (valida token)
      const info = await db.getInviteInfo(token)
      // Step 2: signUp con email dell'invito
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: info.email, password,
        options: { data: { name: info.name, role: info.role } },
      })
      if (authError) throw new Error(authError.message)
      // Se email confirmation è attiva non c'è sessione: chiedi al user di confermare
      if (!authData.session) {
        return { needsEmailConfirmation: true, email: info.email }
      }
      // Step 3: accept_invite linka auth_id e attiva l'account
      const { data: profile, error: rpcError } = await supabase.rpc('accept_invite', { _token: token })
      if (rpcError) throw new Error(rpcError.message)
      return { needsEmailConfirmation: false, profile }
    }
    // Demo: simula signUp + accept
    const users = getStore(KEYS.users)
    const u = users.find(u => u.invite_token === token)
    if (!u) throw new Error('Invito non valido')
    if (u.status !== 'pending') throw new Error('Invito già utilizzato o revocato')
    if (new Date(u.invite_expires_at) < new Date()) throw new Error('Invito scaduto')
    u.password = password
    u.status = 'active'
    u.invite_token = null
    u.invite_expires_at = null
    u.invite_accepted_at = new Date().toISOString()
    u.updated_at = new Date().toISOString()
    setStore(KEYS.users, users)
    setStore(KEYS.session, u)
    return { needsEmailConfirmation: false, profile: u }
  },

  async revokeInvite(userId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('revoke_invite', { _user_id: userId })
      if (error) throw new Error(error.message)
      return data
    }
    const users = getStore(KEYS.users)
    const u = users.find(u => u.id === userId)
    if (!u) throw new Error('Utente non trovato')
    if (u.status !== 'pending') throw new Error('Solo gli inviti in attesa possono essere revocati')
    u.status = 'disabled'
    u.invite_token = null
    u.invite_expires_at = null
    u.updated_at = new Date().toISOString()
    setStore(KEYS.users, users)
    return u
  },

  // ─── PROFILO FORNITORE ESTERNO ───
  async getSupplierProfiles() {
    if (supabase) {
      const { data, error } = await supabase.from('supplier_profiles').select('*').order('company_name')
      if (error) throw error
      return data || []
    }
    return getStore('manutech_supplier_profiles')
  },

  async getSupplierProfile(userId) {
    if (!userId) return null
    if (supabase) {
      const { data, error } = await supabase.from('supplier_profiles').select('*').eq('user_id', userId).maybeSingle()
      if (error) throw error
      return data
    }
    return getStore('manutech_supplier_profiles').find(s => s.user_id === userId) || null
  },

  async upsertSupplierProfile(profile) {
    const payload = { ...profile, updated_at: new Date().toISOString() }
    if (supabase) {
      const orgId = await getMyOrgId()
      const { data, error } = await supabase.from('supplier_profiles')
        .upsert({ ...payload, org_id: payload.org_id || orgId }, { onConflict: 'user_id' })
        .select().single()
      if (error) throw error
      return data
    }
    const profiles = getStore('manutech_supplier_profiles')
    const idx = profiles.findIndex(p => p.user_id === payload.user_id)
    if (idx >= 0) profiles[idx] = { ...profiles[idx], ...payload }
    else profiles.push({ ...payload, org_id: payload.org_id || 'default', created_at: new Date().toISOString() })
    setStore('manutech_supplier_profiles', profiles)
    return payload
  },

  async deleteSupplierProfile(userId) {
    if (supabase) {
      const { error } = await supabase.from('supplier_profiles').delete().eq('user_id', userId)
      if (error) throw error
      return
    }
    const profiles = getStore('manutech_supplier_profiles').filter(p => p.user_id !== userId)
    setStore('manutech_supplier_profiles', profiles)
  },

  async getSession() {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null

      // RPC SECURITY DEFINER: cerca/linka/crea profilo bypassando RLS
      const { data: profile, error } = await supabase.rpc('resolve_my_profile')
      if (error) { console.warn('[ManuTech] Errore resolve profilo:', error.message); return null }
      return profile || null
    }
    try { return JSON.parse(localStorage.getItem(KEYS.session)) } catch (e) { console.warn('[ManuTech] Sessione corrotta:', e.message); return null }
  },

  async logout() {
    if (supabase) {
      await supabase.auth.signOut()
      return
    }
    localStorage.removeItem(KEYS.session)
  },

  // ─── REPORTS ───
  async getReports(filters = {}) {
    if (supabase) {
      let query = supabase.from('reports').select('*, assigned_to_user:users!reports_assigned_to_fkey(name), created_by_user:users!reports_created_by_fkey(name)').order('updated_at', { ascending: false })
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.severity) query = query.eq('severity', filters.severity)
      if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
      const { data, error } = await query
      if (error) throw error
      return data || []
    }
    let reports = getStore(KEYS.reports)
    if (filters.status) reports = reports.filter(r => r.status === filters.status)
    if (filters.severity) reports = reports.filter(r => r.severity === filters.severity)
    return reports.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
  },

  async getReport(id) {
    if (supabase) {
      const { data, error } = await supabase.from('reports').select('*, assigned_to_user:users!reports_assigned_to_fkey(name), created_by_user:users!reports_created_by_fkey(name)').eq('id', id).single()
      if (error) throw error
      return data
    }
    return getStore(KEYS.reports).find(r => r.id === id)
  },

  async createReport(report) {
    if (supabase) {
      const { data, error } = await supabase.from('reports').insert(report).select().single()
      if (error) throw error
      return data
    }
    const reports = getStore(KEYS.reports)
    const newReport = { ...report, id: `rep-${Date.now()}`, created_at: new Date().toISOString(), status: 'aperta', comments: [] }
    reports.unshift(newReport)
    setStore(KEYS.reports, reports)
    return newReport
  },

  async updateReport(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('reports').update(updates).eq('id', id).select().maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Permessi insufficienti: impossibile aggiornare questa segnalazione')
      return data
    }
    const reports = getStore(KEYS.reports)
    const idx = reports.findIndex(r => r.id === id)
    if (idx === -1) throw new Error('Segnalazione non trovata')
    reports[idx] = { ...reports[idx], ...updates, updated_at: new Date().toISOString() }
    setStore(KEYS.reports, reports)
    return reports[idx]
  },

  async deleteReport(id) {
    if (supabase) {
      const { error } = await supabase.from('reports').delete().eq('id', id)
      if (error) throw error
      return
    }
    const reports = getStore(KEYS.reports).filter(r => r.id !== id)
    setStore(KEYS.reports, reports)
  },

  // ─── COMMENTS ───
  async getComments(reportId) {
    if (supabase) {
      const { data, error } = await supabase.from('comments').select('*, user:users(name, role)').eq('report_id', reportId).order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    }
    const report = getStore(KEYS.reports).find(r => r.id === reportId)
    return report?.comments || []
  },

  // Get last comment for each report (for preview in list)
  async getLastCommentsByReports(reportIds) {
    if (!reportIds?.length) return {}
    if (supabase) {
      // Fetch the most recent comment for each report in a single query
      // We get all comments for these reports ordered by created_at desc, then pick the first per report
      const { data, error } = await supabase
        .from('comments')
        .select('report_id, text, user_name, user_role, media, created_at')
        .in('report_id', reportIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Keep only the latest per report
      const map = {}
      for (const c of (data || [])) {
        if (!map[c.report_id]) map[c.report_id] = c
      }
      return map
    }
    // Demo mode
    const allReports = getStore(KEYS.reports)
    const map = {}
    for (const id of reportIds) {
      const r = allReports.find(rep => rep.id === id)
      const comments = r?.comments || []
      if (comments.length > 0) map[id] = comments[comments.length - 1]
    }
    return map
  },

  async addComment(reportId, comment) {
    if (supabase) {
      // Auto-inject org_id if not provided (required by RLS policy)
      let insertData = { ...comment, report_id: reportId }
      if (!insertData.org_id) insertData.org_id = await getMyOrgId()
      const { data, error } = await supabase.from('comments').insert(insertData).select('*, user:users(name, role)').single()
      if (error) throw error
      return data
    }
    const reports = getStore(KEYS.reports)
    const idx = reports.findIndex(r => r.id === reportId)
    if (idx === -1) throw new Error('Segnalazione non trovata')
    const newComment = { ...comment, id: `com-${Date.now()}`, created_at: new Date().toISOString() }
    reports[idx].comments = [...(reports[idx].comments || []), newComment]
    setStore(KEYS.reports, reports)
    return newComment
  },

  // ─── MACHINES ───
  async getMachines() {
    if (supabase) {
      const { data, error } = await supabase.from('machines').select('*').order('sort_order', { ascending: true }).order('name')
      if (error) throw error
      return data || []
    }
    const machines = getStore(KEYS.machines)
    return machines.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  },

  async createMachine(machine) {
    if (supabase) {
      const { data, error } = await supabase.from('machines').insert(machine).select().single()
      if (error) throw error
      return data
    }
    const machines = getStore(KEYS.machines)
    const newMachine = { ...machine, id: `mac-${Date.now()}`, created_at: new Date().toISOString() }
    machines.push(newMachine)
    setStore(KEYS.machines, machines)
    return newMachine
  },

  async updateMachine(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('machines').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const machines = getStore(KEYS.machines)
    const idx = machines.findIndex(m => m.id === id)
    if (idx === -1) throw new Error('Macchinario non trovato')
    machines[idx] = { ...machines[idx], ...updates }
    setStore(KEYS.machines, machines)
    return machines[idx]
  },

  async deleteMachine(id) {
    if (supabase) {
      const { error } = await supabase.from('machines').delete().eq('id', id)
      if (error) throw error
      return
    }
    const machines = getStore(KEYS.machines).filter(m => m.id !== id)
    setStore(KEYS.machines, machines)
  },

  // Aggiorna l'ordine di tutti i macchinari (drag & drop catena)
  async reorderMachines(orderedIds) {
    if (supabase) {
      const results = await Promise.all(
        orderedIds.map((id, i) =>
          supabase.from('machines').update({ sort_order: i + 1 }).eq('id', id)
        )
      )
      const failed = results.find(r => r.error)
      if (failed) throw failed.error
      return
    }
    const machines = getStore(KEYS.machines)
    orderedIds.forEach((id, i) => {
      const m = machines.find(m => m.id === id)
      if (m) m.sort_order = i + 1
    })
    setStore(KEYS.machines, machines)
  },

  // ─── MAINTENANCE PLANS ───
  async getMaintenancePlans(machineId) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans').select('*')
        .eq('machine_id', machineId).order('name')
      if (error) throw error
      return data || []
    }
    return []
  },

  async getAllMaintenancePlans() {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans').select('*').order('name')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Piani con macchina inclusa (evita join client-side)
  async getAllMaintenancePlansWithMachine() {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans')
        .select('*, machine:machines(id, name, department)')
        .order('name')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Ultimo log per ogni piano (evita di scaricare TUTTI i log)
  async getLastLogPerPlan() {
    if (supabase) {
      // Fetch all logs ordered by plan_id and performed_at desc,
      // then deduplicate client-side (Supabase doesn't support DISTINCT ON directly)
      const { data, error } = await supabase.from('maintenance_logs')
        .select('*')
        .not('plan_id', 'is', null)
        .order('performed_at', { ascending: false })
      if (error) throw error
      const lastByPlan = {}
      for (const log of (data || [])) {
        if (!lastByPlan[log.plan_id]) lastByPlan[log.plan_id] = log
      }
      return lastByPlan
    }
    return {}
  },

  // Log con paginazione (per la vista interventi)
  async getMaintenanceLogsPaginated(limit = 50, offset = 0) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_logs')
        .select('*, machine:machines(id, name), component:machine_components(id, name)')
        .order('performed_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (error) throw error
      return data || []
    }
    return []
  },

  async createMaintenancePlan(plan) {
    if (supabase) {
      // Usa RPC SECURITY DEFINER per bypassare RLS e iniettare org_id server-side
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_maintenance_plan', {
        _machine_id: plan.machine_id,
        _name: plan.name,
        _frequency_days: plan.frequency_days || 30,
        _assigned_to: plan.assigned_to || null,
        _assigned_to_name: plan.assigned_to_name || null,
        _instructions: plan.instructions || null,
      })
      if (!rpcError && rpcData) return rpcData
      // Fallback: insert diretto (se RPC non ancora deployata)
      if (rpcError) console.warn('[ManuTech] RPC create_maintenance_plan non disponibile, fallback insert diretto:', rpcError.message)
      const insertData = { ...plan }
      insertData.org_id = await getMyOrgId()
      const { data, error } = await supabase.from('maintenance_plans').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    return { ...plan, id: `mp-${Date.now()}`, created_at: new Date().toISOString() }
  },

  async updateMaintenancePlan(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    return { id, ...updates }
  },

  async deleteMaintenancePlan(id) {
    if (supabase) {
      const { error } = await supabase.from('maintenance_plans').delete().eq('id', id)
      if (error) throw error
    }
  },

  async takeMaintenancePlan(planId, userId, userName) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans').update({
        current_status: 'in_corso',
        taken_by: userId,
        taken_by_name: userName,
        taken_at: new Date().toISOString(),
      }).eq('id', planId).select().single()
      if (error) throw error
      return data
    }
    return { id: planId, current_status: 'in_corso', taken_by: userId, taken_by_name: userName }
  },

  async completeMaintenancePlan(planId) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans').update({
        current_status: 'completata',
      }).eq('id', planId).select().single()
      if (error) throw error
      return data
    }
    return { id: planId, current_status: 'completata' }
  },

  async resetMaintenancePlan(planId) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans').update({
        current_status: 'da_eseguire',
        taken_by: null,
        taken_by_name: null,
        taken_at: null,
      }).eq('id', planId).select().single()
      if (error) throw error
      return data
    }
    return { id: planId, current_status: 'da_eseguire' }
  },

  async importMaintenancePlans(plans) {
    if (supabase) {
      const orgId = await getMyOrgId()
      const rows = plans.map(p => ({ ...p, org_id: p.org_id || orgId }))
      const { data, error } = await supabase.from('maintenance_plans').insert(rows).select()
      if (error) throw error
      return data || []
    }
    return plans.map(p => ({ ...p, id: `mp-${Date.now()}-${Math.random().toString(36).slice(2, 4)}` }))
  },

  // ─── MAINTENANCE LOGS ───
  async getMaintenanceLogs(machineId) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_logs').select('*')
        .eq('machine_id', machineId).order('performed_at', { ascending: false })
      if (error) throw error
      return data || []
    }
    return []
  },

  async getLastLogForPlan(planId) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_logs').select('*')
        .eq('plan_id', planId).order('performed_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data
    }
    return null
  },

  async getAllMaintenanceLogs() {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_logs').select('*')
        .order('performed_at', { ascending: false })
      if (error) throw error
      return data || []
    }
    return []
  },

  async createMaintenanceLog(log) {
    if (supabase) {
      // Usa RPC SECURITY DEFINER per bypassare RLS e iniettare org_id server-side
      const rpcParams = {
        _machine_id: log.machine_id,
        _title: log.title,
        _plan_id: log.plan_id || null,
        _report_id: log.report_id || null,
        _component_id: log.component_id || null,
        _type: log.type || 'programmata',
        _description: log.description || null,
        _performed_by_name: log.performed_by_name || null,
        _duration_minutes: log.duration_minutes || null,
        _parts_replaced: log.parts_replaced || null,
        _performed_at: log.performed_at || new Date().toISOString(),
        _is_external: !!log.is_external,
        _contractor_name: log.contractor_name || null,
        _contractor_reference: log.contractor_reference || null,
        _media: Array.isArray(log.media) ? log.media : [],
      }
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_maintenance_log', rpcParams)
      if (!rpcError && rpcData) return rpcData
      // Fallback: insert diretto (se RPC non ancora deployata)
      if (rpcError) console.warn('[ManuTech] RPC create_maintenance_log non disponibile, fallback insert diretto:', rpcError.message)
      let insertData = { ...log }
      if (!insertData.org_id || insertData.org_id === 'default') {
        insertData.org_id = await getMyOrgId()
      }
      const { data, error } = await supabase.from('maintenance_logs').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    return { ...log, id: `ml-${Date.now()}`, created_at: new Date().toISOString() }
  },

  // ─── KNOWLEDGE BASE AI (biblioteca tecnica macchine) ───
  // Avvia l'indicizzazione di una macchina dopo che sono cambiati documenti,
  // istruzioni o maintenance_logs. Awaita il completamento dell'edge function
  // e ritorna il risultato: { ok, chunks?, durations_ms?, error? }.
  // In demo mode (no Supabase) ritorna { ok: false, demo: true } senza throw.
  async queueMachineReindex(machineId) {
    if (!supabase || !machineId) return { ok: false, demo: true }
    try {
      // Recupera la sessione utente per allegare il JWT.
      // supabase.functions.invoke() a volte non propaga il messaggio di errore
      // reale dell'edge function, quindi usiamo fetch diretto per leggere il body.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        return { ok: false, error: 'Sessione scaduta — rieffettua il login' }
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/ingest-knowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ machine_id: machineId }),
      })

      // Parsa il body anche sugli errori (può essere JSON con { error: "..." } o testo)
      let body = null
      let rawText = null
      try { rawText = await res.text() } catch { /* no body */ }
      if (rawText) {
        try { body = JSON.parse(rawText) } catch { body = null }
      }

      if (!res.ok) {
        const detail = body?.error || rawText || `HTTP ${res.status}`
        const msg = `[${res.status}] ${detail}`
        console.warn('[ManuTech] ingest-knowledge error:', msg)
        return { ok: false, error: msg, status: res.status }
      }
      if (body?.ok) {
        console.info('[ManuTech] knowledge base aggiornata:', body)
        return { ok: true, chunks: body.chunks ?? 0, ...body }
      }
      return { ok: false, error: body?.error || 'unknown error' }
    } catch (err) {
      console.warn('[ManuTech] queueMachineReindex throw:', err)
      return { ok: false, error: err.message || 'network error' }
    }
  },

  // Statistiche della biblioteca AI per una macchina (per badge UI)
  // Ritorna { chunks, sources, last_indexed_at, by_kind }
  async getKnowledgeStats(machineId) {
    if (!supabase || !machineId) {
      return { chunks: 0, sources: 0, last_indexed_at: null }
    }
    try {
      const { data, error } = await supabase.rpc('get_knowledge_stats', { p_machine_id: machineId })
      if (error) {
        console.warn('[ManuTech] getKnowledgeStats error:', error.message)
        return { chunks: 0, sources: 0, last_indexed_at: null }
      }
      return data || { chunks: 0, sources: 0, last_indexed_at: null }
    } catch (err) {
      console.warn('[ManuTech] getKnowledgeStats throw:', err)
      return { chunks: 0, sources: 0, last_indexed_at: null }
    }
  },

  async deleteMaintenanceLog(id) {
    if (supabase) {
      const { error } = await supabase.from('maintenance_logs').delete().eq('id', id)
      if (error) throw error
    }
  },

  // ─── AREAS ───
  async getAreas() {
    if (supabase) {
      const { data, error } = await supabase.from('areas')
        .select('*').order('sort_order').order('name')
      if (error) throw error
      return data || []
    }
    return getStore('manutech_areas').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  },

  async createArea(area) {
    if (supabase) {
      const insertData = { ...area, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('areas').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_areas')
    const newItem = { ...area, id: `area-${Date.now()}`, created_at: new Date().toISOString() }
    items.push(newItem)
    setStore('manutech_areas', items)
    return newItem
  },

  async updateArea(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('areas')
        .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_areas')
    const idx = items.findIndex(a => a.id === id)
    if (idx === -1) throw new Error('Area non trovata')
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
    setStore('manutech_areas', items)
    return items[idx]
  },

  async deleteArea(id) {
    if (supabase) {
      const { error } = await supabase.from('areas').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_areas').filter(a => a.id !== id)
    setStore('manutech_areas', items)
  },

  // ─── MACHINE COMPONENTS ───
  async getMachineComponents(machineId) {
    if (supabase) {
      const { data, error } = await supabase.from('machine_components')
        .select('*').eq('machine_id', machineId).order('sort_order').order('name')
      if (error) throw error
      return data || []
    }
    return getStore('manutech_components').filter(c => c.machine_id === machineId)
  },

  async createMachineComponent(component) {
    if (supabase) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_machine_component', {
        _machine_id: component.machine_id,
        _name: component.name,
        _type: component.type || null,
        _serial_number: component.serial_number || null,
        _manufacturer: component.manufacturer || null,
        _model: component.model || null,
        _year: component.year || null,
        _notes: component.notes || null,
      })
      if (!rpcError && rpcData) return rpcData
      if (rpcError) console.warn('[ManuTech] RPC fallback:', rpcError.message)
      const insertData = { ...component, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('machine_components').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_components')
    const newItem = { ...component, id: `comp-${Date.now()}`, created_at: new Date().toISOString() }
    items.push(newItem)
    setStore('manutech_components', items)
    return newItem
  },

  async updateMachineComponent(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('machine_components')
        .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_components')
    const idx = items.findIndex(c => c.id === id)
    if (idx === -1) throw new Error('Componente non trovato')
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
    setStore('manutech_components', items)
    return items[idx]
  },

  async deleteMachineComponent(id) {
    if (supabase) {
      const { error } = await supabase.from('machine_components').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_components').filter(c => c.id !== id)
    setStore('manutech_components', items)
  },

  // ─── SPARE PARTS (RICAMBI) ───
  async getSpareParts() {
    if (supabase) {
      const { data, error } = await supabase.from('spare_parts')
        .select('*').order('name')
      if (error) throw error
      return data || []
    }
    return getStore('manutech_spare_parts')
  },

  async createSparePart(part) {
    if (supabase) {
      const insertData = { ...part, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('spare_parts').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_parts')
    const newItem = { ...part, id: `sp-${Date.now()}`, created_at: new Date().toISOString() }
    items.push(newItem)
    setStore('manutech_spare_parts', items)
    return newItem
  },

  async updateSparePart(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('spare_parts')
        .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_parts')
    const idx = items.findIndex(s => s.id === id)
    if (idx === -1) throw new Error('Ricambio non trovato')
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
    setStore('manutech_spare_parts', items)
    return items[idx]
  },

  async deleteSparePart(id) {
    if (supabase) {
      const { error } = await supabase.from('spare_parts').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_spare_parts').filter(s => s.id !== id)
    setStore('manutech_spare_parts', items)
  },

  // ─── SPARE PART ORDERS (ORDINI RICAMBI) ───
  async getSparePartOrders(filters = {}) {
    if (supabase) {
      let query = supabase.from('spare_part_orders').select('*').order('created_at', { ascending: false })
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.report_id) query = query.eq('report_id', filters.report_id)
      const { data, error } = await query
      if (error) throw error
      return data || []
    }
    let items = getStore('manutech_spare_orders')
    if (filters.status) items = items.filter(o => o.status === filters.status)
    if (filters.report_id) items = items.filter(o => o.report_id === filters.report_id)
    return items
  },

  async createSparePartOrder(order) {
    if (supabase) {
      const insertData = { ...order, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('spare_part_orders').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_orders')
    const newItem = { ...order, id: `spo-${Date.now()}`, created_at: new Date().toISOString(), ordered_at: new Date().toISOString() }
    items.push(newItem)
    setStore('manutech_spare_orders', items)
    return newItem
  },

  async updateSparePartOrder(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('spare_part_orders')
        .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_orders')
    const idx = items.findIndex(o => o.id === id)
    if (idx === -1) throw new Error('Ordine non trovato')
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
    setStore('manutech_spare_orders', items)
    return items[idx]
  },

  async receiveSparePartOrder(orderId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('receive_spare_part_order', { _order_id: orderId })
      if (error) throw error
      return data
    }
    // Demo: aggiorna ordine e stock manualmente
    const orders = getStore('manutech_spare_orders')
    const idx = orders.findIndex(o => o.id === orderId)
    if (idx === -1) throw new Error('Ordine non trovato')
    orders[idx] = { ...orders[idx], status: 'ricevuto', received_at: new Date().toISOString() }
    setStore('manutech_spare_orders', orders)
    if (orders[idx].spare_part_id) {
      const parts = getStore('manutech_spare_parts')
      const pi = parts.findIndex(p => p.id === orders[idx].spare_part_id)
      if (pi >= 0) { parts[pi].stock_qty = (parts[pi].stock_qty || 0) + orders[idx].quantity; setStore('manutech_spare_parts', parts) }
    }
    return orders[idx]
  },

  async deleteSparePartOrder(id) {
    if (supabase) {
      const { error } = await supabase.from('spare_part_orders').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_spare_orders').filter(o => o.id !== id)
    setStore('manutech_spare_orders', items)
  },

  // ─── SPARE PART COMPATIBILITY ───
  async getSparePartCompatibility(sparePartId) {
    if (supabase) {
      const { data, error } = await supabase.from('spare_part_compatibility')
        .select('*, machine:machines(id, name), component:machine_components(id, name)')
        .eq('spare_part_id', sparePartId)
      if (error) throw error
      return data || []
    }
    return getStore('manutech_spare_compat').filter(c => c.spare_part_id === sparePartId)
  },

  async getCompatibleSpareParts(machineId, componentId = null) {
    if (supabase) {
      let query = supabase.from('spare_part_compatibility')
        .select('*, spare_part:spare_parts(*)')
        .eq('machine_id', machineId)
      if (componentId) query = query.eq('component_id', componentId)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map(d => d.spare_part).filter(Boolean)
    }
    const compat = getStore('manutech_spare_compat').filter(c =>
      c.machine_id === machineId && (!componentId || c.component_id === componentId)
    )
    const parts = getStore('manutech_spare_parts')
    return compat.map(c => parts.find(p => p.id === c.spare_part_id)).filter(Boolean)
  },

  async addSparePartCompatibility(sparePartId, machineId, componentId = null) {
    if (supabase) {
      const insertData = { spare_part_id: sparePartId, machine_id: machineId, component_id: componentId, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('spare_part_compatibility').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_compat')
    const newItem = { id: `spc-${Date.now()}`, spare_part_id: sparePartId, machine_id: machineId, component_id: componentId }
    items.push(newItem)
    setStore('manutech_spare_compat', items)
    return newItem
  },

  async removeSparePartCompatibility(id) {
    if (supabase) {
      const { error } = await supabase.from('spare_part_compatibility').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_spare_compat').filter(c => c.id !== id)
    setStore('manutech_spare_compat', items)
  },

  // ─── FILE STORAGE ───
  async uploadFile(bucket, path, file) {
    if (supabase) {
      const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg'
      const safeName = (path || `uploads/${Date.now()}`)
        .replace(/[^a-zA-Z0-9/_.-]/g, '_')
        .replace(/_{2,}/g, '_')
      const uniquePath = `${safeName}.${ext}`
      const { error } = await supabase.storage.from(bucket).upload(uniquePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/octet-stream',
      })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(uniquePath)
      return publicUrl
    }
    // Fallback: converte in base64 per localStorage
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  },

  // ─── ACTIVITY LOG ───
  // Traccia ogni evento: creazione, cambio stato, commento, media
  async addActivity(reportId, activity) {
    if (supabase) {
      // Auto-inject org_id if not provided (required by RLS policy)
      let insertData = { ...activity, report_id: reportId }
      if (!insertData.org_id) insertData.org_id = await getMyOrgId()
      const { data, error } = await supabase.from('activities').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const activities = getStore(KEYS.activities)
    const newActivity = {
      ...activity,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      report_id: reportId,
      created_at: new Date().toISOString(),
    }
    activities.unshift(newActivity)
    setStore(KEYS.activities, activities)
    return newActivity
  },

  async getActivities(reportId) {
    if (supabase) {
      const { data, error } = await supabase.from('activities').select('*').eq('report_id', reportId).order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    }
    return getStore(KEYS.activities).filter(a => a.report_id === reportId)
  },

  async getAllActivities(limit = 50) {
    if (supabase) {
      const { data, error } = await supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return data || []
    }
    return getStore(KEYS.activities).slice(0, limit)
  },

  // ─── NOTIFICATIONS ───
  async addNotification(notification) {
    if (supabase) {
      // Auto-inject org_id if not provided (required by RLS policy)
      if (!notification.org_id) {
        notification = { ...notification, org_id: await getMyOrgId() }
      }
      const { data, error } = await supabase.from('notifications').insert(notification).select().single()
      if (error) throw error
      return data
    }
    const notifs = getStore(KEYS.notifications)
    const newNotif = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      read: false,
      created_at: new Date().toISOString(),
    }
    notifs.unshift(newNotif)
    // Mantieni max 100 notifiche
    if (notifs.length > 100) notifs.length = 100
    setStore(KEYS.notifications, notifs)
    return newNotif
  },

  async getNotifications(userId, limit = 30) {
    if (supabase) {
      const { data, error } = await supabase.from('notifications').select('*')
        .or(`target_user.eq.${userId},target_user.is.null`)
        .order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return data || []
    }
    // In demo, mostra tutte le notifiche (non filtriamo per utente)
    return getStore(KEYS.notifications).slice(0, limit)
  },

  async markNotificationRead(id) {
    if (supabase) {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
      if (error) throw error
      return
    }
    const notifs = getStore(KEYS.notifications)
    const idx = notifs.findIndex(n => n.id === id)
    if (idx >= 0) { notifs[idx].read = true; setStore(KEYS.notifications, notifs) }
  },

  async markAllNotificationsRead(userId) {
    if (supabase) {
      const { error } = await supabase.from('notifications').update({ read: true })
        .or(`target_user.eq.${userId},target_user.is.null`)
        .eq('read', false)
      if (error) throw error
      return
    }
    const notifs = getStore(KEYS.notifications)
    notifs.forEach(n => n.read = true)
    setStore(KEYS.notifications, notifs)
  },

  // ─── PUSH SUBSCRIPTIONS ───
  async savePushSubscription(userId, subscription, orgId = 'default') {
    if (supabase) {
      const { endpoint, keys } = subscription
      const { data, error } = await supabase.from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          org_id: orgId,
        }, { onConflict: 'user_id,endpoint' })
        .select().single()
      if (error) throw error
      return data
    }
    // Demo: salva in localStorage
    const subs = getStore('manutech_push_subs')
    const idx = subs.findIndex(s => s.user_id === userId && s.endpoint === subscription.endpoint)
    const entry = { user_id: userId, endpoint: subscription.endpoint, keys: subscription.keys, org_id: orgId }
    if (idx >= 0) subs[idx] = entry; else subs.push(entry)
    setStore('manutech_push_subs', subs)
    return entry
  },

  async getPushSubscriptions(userId) {
    if (supabase) {
      const { data, error } = await supabase.from('push_subscriptions')
        .select('id, endpoint, created_at').eq('user_id', userId)
      if (error) throw error
      return data || []
    }
    return getStore('manutech_push_subs').filter(s => s.user_id === userId)
  },

  async deletePushSubscription(userId, endpoint) {
    if (supabase) {
      const { error } = await supabase.from('push_subscriptions')
        .delete().eq('user_id', userId).eq('endpoint', endpoint)
      if (error) throw error
      return
    }
    const subs = getStore('manutech_push_subs').filter(s => !(s.user_id === userId && s.endpoint === endpoint))
    setStore('manutech_push_subs', subs)
  },

  // ─── NOTIFICATION PREFERENCES (DB) ───
  async getUserNotifPrefs(userId) {
    if (supabase) {
      const { data, error } = await supabase.from('notification_preferences')
        .select('prefs').eq('user_id', userId).eq('is_org_default', false).maybeSingle()
      if (error) throw error
      return data?.prefs || null
    }
    // Demo fallback: localStorage
    try {
      const raw = localStorage.getItem(`manutech_notif_prefs_${userId}`)
      return raw ? JSON.parse(raw) : null
    } catch (e) { console.warn('[ManuTech] Preferenze notifiche corrotte:', e.message); return null }
  },

  async saveUserNotifPrefs(userId, prefs, orgId = 'default') {
    if (supabase) {
      const { data, error } = await supabase.from('notification_preferences')
        .upsert({
          user_id: userId,
          prefs,
          is_org_default: false,
          org_id: orgId,
        }, { onConflict: 'user_id' })
        .select().single()
      if (error) throw error
      return data
    }
    localStorage.setItem(`manutech_notif_prefs_${userId}`, JSON.stringify(prefs))
  },

  // ─── STATUS ASSESSMENT (Edge Function) ───
  async fetchMachineAssessments(orgId, machineId = null) {
    if (supabase) {
      const params = new URLSearchParams({ org_id: orgId })
      if (machineId) params.append('machine_id', machineId)
      const url = `${supabaseUrl}/functions/v1/status-assessment?${params.toString()}`
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
      })
      if (!res.ok) throw new Error(`Assessment failed: ${res.status}`)
      return await res.json()
    }
    // Demo fallback: calcolo locale semplificato
    const machines = getStore(KEYS.machines)
    const reports = getStore(KEYS.reports)
    const target = machineId ? machines.filter(m => m.id === machineId) : machines
    const assessments = target.map(m => {
      const machineReports = reports.filter(r => r.machine === m.name)
      const open = machineReports.filter(r => r.status !== 'risolta')
      const critical = open.filter(r => r.severity === 'critica').length
      let score = 100 - (critical * 25) - (open.filter(r => r.severity === 'alta').length * 15) - (open.filter(r => r.severity === 'media').length * 8) - (open.filter(r => r.severity === 'bassa').length * 3)
      score = Math.max(0, Math.min(100, score))
      const status = score >= 85 ? 'ottimo' : score >= 65 ? 'buono' : score >= 40 ? 'attenzione' : 'critico'
      return {
        machine_id: m.id, machine_name: m.name, health_score: score, status,
        open_reports: open.length, critical_reports: critical, overdue_maintenance: 0,
        avg_resolution_hours: null, factors: open.length === 0 ? ['Nessun problema rilevato'] : [`${open.length} segnalazione/i aperta/e`],
      }
    })
    assessments.sort((a, b) => a.health_score - b.health_score)
    const summary = {
      total_machines: assessments.length,
      critical: assessments.filter(a => a.status === 'critico').length,
      attention: assessments.filter(a => a.status === 'attenzione').length,
      good: assessments.filter(a => a.status === 'buono').length,
      excellent: assessments.filter(a => a.status === 'ottimo').length,
      avg_health_score: assessments.length > 0 ? Math.round(assessments.reduce((s, a) => s + a.health_score, 0) / assessments.length) : 100,
    }
    return { assessments, summary, generated_at: new Date().toISOString() }
  },

  async deleteUserNotifPrefs(userId) {
    if (supabase) {
      const { error } = await supabase.from('notification_preferences')
        .delete().eq('user_id', userId).eq('is_org_default', false)
      if (error) throw error
      return
    }
    localStorage.removeItem(`manutech_notif_prefs_${userId}`)
  },

  async getOrgNotifDefaults(orgId = 'default') {
    if (supabase) {
      const { data, error } = await supabase.from('notification_preferences')
        .select('role, prefs').eq('org_id', orgId).eq('is_org_default', true)
      if (error) throw error
      if (!data || data.length === 0) return null
      // Converti array in oggetto { role: prefs }
      const result = {}
      data.forEach(row => { result[row.role] = row.prefs })
      return result
    }
    try {
      const raw = localStorage.getItem('manutech_notif_org_defaults')
      return raw ? JSON.parse(raw) : null
    } catch (e) { console.warn('[ManuTech] Default org notifiche corrotti:', e.message); return null }
  },

  async saveOrgNotifDefaults(orgId = 'default', role, prefs) {
    if (supabase) {
      // Upsert per ruolo — usa user_id = NULL per org defaults
      // Dato che UNIQUE è su user_id (e NULL non matcha), usiamo delete+insert
      await supabase.from('notification_preferences')
        .delete().eq('org_id', orgId).eq('is_org_default', true).eq('role', role)
      const { data, error } = await supabase.from('notification_preferences')
        .insert({
          user_id: null,
          role,
          prefs,
          is_org_default: true,
          org_id: orgId,
        }).select().single()
      if (error) throw error
      return data
    }
    const orgDefaults = JSON.parse(localStorage.getItem('manutech_notif_org_defaults') || '{}')
    orgDefaults[role] = prefs
    localStorage.setItem('manutech_notif_org_defaults', JSON.stringify(orgDefaults))
  },

  // ─── GUEST ACCESS (chat senza login) ───

  async createGuestToken(reportId) {
    if (supabase) {
      const token = crypto.randomUUID().split('-')[0]
      const { data, error } = await supabase.from('guest_tokens')
        .insert({ report_id: reportId, token, org_id: await getMyOrgId() })
        .select().single()
      if (error) throw error
      return data
    }
    const tokens = JSON.parse(localStorage.getItem('manutech_guest_tokens') || '[]')
    const token = Math.random().toString(36).slice(2, 10)
    const newToken = { id: `gt-${Date.now()}`, report_id: reportId, token, enabled: true, org_id: 'default', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }
    tokens.push(newToken)
    localStorage.setItem('manutech_guest_tokens', JSON.stringify(tokens))
    return newToken
  },

  async getGuestTokens(reportId) {
    if (supabase) {
      const { data, error } = await supabase.from('guest_tokens')
        .select('*').eq('report_id', reportId).order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }
    return JSON.parse(localStorage.getItem('manutech_guest_tokens') || '[]').filter(t => t.report_id === reportId)
  },

  async revokeGuestToken(tokenId) {
    if (supabase) {
      const { error } = await supabase.from('guest_tokens').update({ enabled: false }).eq('id', tokenId)
      if (error) throw error
      return
    }
    const tokens = JSON.parse(localStorage.getItem('manutech_guest_tokens') || '[]')
    const idx = tokens.findIndex(t => t.id === tokenId)
    if (idx >= 0) { tokens[idx].enabled = false; localStorage.setItem('manutech_guest_tokens', JSON.stringify(tokens)) }
  },

  // Guest methods (no auth — call Edge Function or localStorage directly)

  async guestValidateToken(reportId, token) {
    if (supabase) {
      const res = await fetch(`${supabaseUrl}/functions/v1/guest-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
        body: JSON.stringify({ action: 'validate', reportId, token }),
      })
      if (!res.ok) throw new Error('Token non valido')
      return await res.json()
    }
    const tokens = JSON.parse(localStorage.getItem('manutech_guest_tokens') || '[]')
    const gt = tokens.find(t => t.token === token && t.report_id === reportId && t.enabled)
    if (!gt) throw new Error('Token non valido')
    const report = getStore(KEYS.reports).find(r => r.id === reportId)
    if (!report) throw new Error('Segnalazione non trovata')
    return { valid: true, report: { id: report.id, title: report.title, status: report.status, severity: report.severity } }
  },

  async guestGetComments(reportId, token) {
    if (supabase) {
      const res = await fetch(`${supabaseUrl}/functions/v1/guest-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
        body: JSON.stringify({ action: 'get-comments', reportId, token }),
      })
      if (!res.ok) throw new Error('Errore caricamento messaggi')
      return await res.json()
    }
    const report = getStore(KEYS.reports).find(r => r.id === reportId)
    return report?.comments || []
  },

  async guestAddComment(reportId, token, text, guestName) {
    if (supabase) {
      const res = await fetch(`${supabaseUrl}/functions/v1/guest-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
        body: JSON.stringify({ action: 'add-comment', reportId, token, text, guestName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Errore invio messaggio')
      }
      return await res.json()
    }
    const reports = getStore(KEYS.reports)
    const idx = reports.findIndex(r => r.id === reportId)
    if (idx === -1) throw new Error('Segnalazione non trovata')
    const newComment = { id: `com-${Date.now()}`, text, user_id: null, user_name: guestName || 'Ospite', user_role: 'guest', media: null, report_id: reportId, created_at: new Date().toISOString() }
    reports[idx].comments = [...(reports[idx].comments || []), newComment]
    setStore(KEYS.reports, reports)
    return newComment
  },

  // ─── DIRECT MESSAGES (Chat 1-a-1) ───

  async getConversations(userId) {
    if (supabase) {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, p1:users!conversations_participant_1_fkey(id, name, role, avatar_url), p2:users!conversations_participant_2_fkey(id, name, role, avatar_url)')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
      if (error) { console.warn('[DM] getConversations error:', error.message); return [] }
      return (data || []).map(c => {
        const other = c.p1?.id === userId ? c.p2 : c.p1
        return { ...c, otherUser: other }
      })
    }
    // Demo mode
    const convs = JSON.parse(localStorage.getItem('manutech_conversations') || '[]')
    const users = getStore(KEYS.users)
    return convs
      .filter(c => c.participant_1 === userId || c.participant_2 === userId)
      .sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at))
      .map(c => {
        const otherId = c.participant_1 === userId ? c.participant_2 : c.participant_1
        const otherUser = users.find(u => u.id === otherId) || { id: otherId, name: 'Utente', role: 'operatore' }
        return { ...c, otherUser }
      })
  },

  async getOrCreateConversation(userId1, userId2, orgId = 'default') {
    // Normalize: smaller UUID first
    const [p1, p2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1]

    if (supabase) {
      // Check existing
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('participant_1', p1)
        .eq('participant_2', p2)
        .maybeSingle()
      if (existing) return existing

      const insertOrgId = orgId || await getMyOrgId()
      const { data, error } = await supabase
        .from('conversations')
        .insert({ participant_1: p1, participant_2: p2, org_id: insertOrgId })
        .select()
        .single()
      if (error) {
        console.warn('[DM] getOrCreateConversation insert error:', error.message)
        throw new Error('Impossibile creare la conversazione. Verifica che la migrazione DB sia stata eseguita.')
      }
      return data
    }
    // Demo mode
    const convs = JSON.parse(localStorage.getItem('manutech_conversations') || '[]')
    let existing = convs.find(c => c.participant_1 === p1 && c.participant_2 === p2)
    if (existing) return existing
    const newConv = {
      id: `conv-${Date.now()}`,
      participant_1: p1,
      participant_2: p2,
      last_message_text: null,
      last_message_at: null,
      last_message_by: null,
      org_id: orgId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    convs.push(newConv)
    localStorage.setItem('manutech_conversations', JSON.stringify(convs))
    return newConv
  },

  async getDirectMessages(conversationId) {
    if (supabase) {
      const { data, error } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) { console.warn('[DM] getDirectMessages error:', error.message); return [] }
      return data || []
    }
    const msgs = JSON.parse(localStorage.getItem('manutech_direct_messages') || '[]')
    return msgs
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  },

  async sendDirectMessage(conversationId, { senderId, senderName, senderRole, text, media, orgId }) {
    const now = new Date().toISOString()
    if (supabase) {
      const msgOrgId = orgId || await getMyOrgId()
      const { data, error } = await supabase
        .from('direct_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          sender_name: senderName,
          sender_role: senderRole,
          text,
          media: media || null,
          org_id: msgOrgId,
          created_at: now,
        })
        .select()
        .single()
      if (error) throw error

      // Update conversation last_message
      await supabase
        .from('conversations')
        .update({
          last_message_text: text,
          last_message_at: now,
          last_message_by: senderId,
        })
        .eq('id', conversationId)

      return data
    }
    // Demo mode
    const msgs = JSON.parse(localStorage.getItem('manutech_direct_messages') || '[]')
    const newMsg = {
      id: `dm-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: senderRole,
      text,
      media: media || null,
      org_id: orgId || 'default',
      created_at: now,
    }
    msgs.push(newMsg)
    localStorage.setItem('manutech_direct_messages', JSON.stringify(msgs))

    // Update conversation
    const convs = JSON.parse(localStorage.getItem('manutech_conversations') || '[]')
    const ci = convs.findIndex(c => c.id === conversationId)
    if (ci !== -1) {
      convs[ci].last_message_text = text
      convs[ci].last_message_at = now
      convs[ci].last_message_by = senderId
      localStorage.setItem('manutech_conversations', JSON.stringify(convs))
    }
    return newMsg
  },

  async getUnreadDMCounts(userId) {
    if (supabase) {
      // Get all conversations for this user
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      if (!convs?.length) return {}

      // Get read timestamps
      const { data: reads } = await supabase
        .from('dm_reads')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId)
      const readsMap = {}
      ;(reads || []).forEach(r => { readsMap[r.conversation_id] = r.last_read_at })

      const counts = {}
      for (const conv of convs) {
        let query = supabase
          .from('direct_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId)
        if (readsMap[conv.id]) {
          query = query.gt('created_at', readsMap[conv.id])
        }
        const { count } = await query
        if (count > 0) counts[conv.id] = count
      }
      return counts
    }
    // Demo mode
    const msgs = JSON.parse(localStorage.getItem('manutech_direct_messages') || '[]')
    const reads = JSON.parse(localStorage.getItem('manutech_dm_reads') || '{}')
    const convs = JSON.parse(localStorage.getItem('manutech_conversations') || '[]')
    const myConvs = convs.filter(c => c.participant_1 === userId || c.participant_2 === userId)
    const counts = {}
    for (const conv of myConvs) {
      const lastRead = reads[conv.id]
      const unread = msgs.filter(m =>
        m.conversation_id === conv.id &&
        m.sender_id !== userId &&
        (!lastRead || new Date(m.created_at) > new Date(lastRead))
      ).length
      if (unread > 0) counts[conv.id] = unread
    }
    return counts
  },

  async markDMAsRead(conversationId, userId) {
    const now = new Date().toISOString()
    if (supabase) {
      const { error } = await supabase
        .from('dm_reads')
        .upsert(
          { user_id: userId, conversation_id: conversationId, last_read_at: now },
          { onConflict: 'conversation_id,user_id' }
        )
      if (error) throw error
      return
    }
    // Demo mode
    const reads = JSON.parse(localStorage.getItem('manutech_dm_reads') || '{}')
    reads[conversationId] = now
    localStorage.setItem('manutech_dm_reads', JSON.stringify(reads))
  },

  // ═══════════════════════════════════════════════════════════
  // MANUCOIN WALLET
  // ═══════════════════════════════════════════════════════════

  async getTokenConfig() {
    if (supabase) {
      const { data } = await supabase.from('token_config').select('*').single()
      return data || { token_name: 'ManuCoin', token_symbol: 'MC', token_value_eur: 0.50 }
    }
    return JSON.parse(localStorage.getItem('manutech_token_config') || '{}') || { token_name: 'ManuCoin', token_symbol: 'MC', token_value_eur: 0.50 }
  },

  async saveTokenConfig(config) {
    if (supabase) {
      const orgId = await getMyOrgId()
      const { data, error } = await supabase
        .from('token_config')
        .upsert({ ...config, org_id: orgId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
        .select().single()
      if (error) throw error
      return data
    }
    localStorage.setItem('manutech_token_config', JSON.stringify(config))
    return config
  },

  async getTokenBalance(userId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('get_token_balance', { _user_id: userId || null })
      if (error) return 0
      return data || 0
    }
    const txs = JSON.parse(localStorage.getItem('manutech_token_tx') || '[]')
    return txs.filter(t => t.user_id === userId)
      .reduce((bal, t) => bal + (['earn', 'bonus', 'refund'].includes(t.type) ? t.amount : -t.amount), 0)
  },

  async getTokenTransactions(userId, limit = 50) {
    if (supabase) {
      let query = supabase.from('token_transactions').select('*').order('created_at', { ascending: false }).limit(limit)
      if (userId) query = query.eq('user_id', userId)
      const { data } = await query
      return data || []
    }
    const txs = JSON.parse(localStorage.getItem('manutech_token_tx') || '[]')
    return userId ? txs.filter(t => t.user_id === userId).slice(0, limit) : txs.slice(0, limit)
  },

  async creditTokens(userId, amount, reason, reasonCode = null, referenceId = null, type = 'earn') {
    if (supabase) {
      const { data, error } = await supabase.rpc('credit_tokens', {
        _user_id: userId, _amount: amount, _reason: reason,
        _reason_code: reasonCode, _reference_id: referenceId, _type: type,
      })
      if (error) throw error
      return data
    }
    // Demo mode
    const txs = JSON.parse(localStorage.getItem('manutech_token_tx') || '[]')
    const balance = txs.filter(t => t.user_id === userId)
      .reduce((bal, t) => bal + (['earn', 'bonus', 'refund'].includes(t.type) ? t.amount : -t.amount), 0)
    const tx = {
      id: `tx-${Date.now()}`, user_id: userId, type, amount, reason,
      reason_code: reasonCode, reference_id: referenceId,
      balance_after: balance + amount, created_at: new Date().toISOString(),
    }
    txs.unshift(tx)
    localStorage.setItem('manutech_token_tx', JSON.stringify(txs))
    return tx
  },

  // ── Catalogo premi ──

  async getRewardCatalog() {
    if (supabase) {
      const { data } = await supabase.from('reward_catalog').select('*').eq('active', true).order('cost', { ascending: true })
      return data || []
    }
    return JSON.parse(localStorage.getItem('manutech_rewards') || '[]').filter(r => r.active !== false)
  },

  async getAllRewards() {
    if (supabase) {
      const { data } = await supabase.from('reward_catalog').select('*').order('created_at', { ascending: false })
      return data || []
    }
    return JSON.parse(localStorage.getItem('manutech_rewards') || '[]')
  },

  async createReward(reward) {
    if (supabase) {
      const orgId = await getMyOrgId()
      const { data, error } = await supabase.from('reward_catalog').insert({ ...reward, org_id: orgId }).select().single()
      if (error) throw error
      return data
    }
    const rewards = JSON.parse(localStorage.getItem('manutech_rewards') || '[]')
    const r = { ...reward, id: `rw-${Date.now()}`, active: true, created_at: new Date().toISOString() }
    rewards.unshift(r)
    localStorage.setItem('manutech_rewards', JSON.stringify(rewards))
    return r
  },

  async updateReward(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('reward_catalog').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const rewards = JSON.parse(localStorage.getItem('manutech_rewards') || '[]')
    const idx = rewards.findIndex(r => r.id === id)
    if (idx >= 0) { rewards[idx] = { ...rewards[idx], ...updates }; localStorage.setItem('manutech_rewards', JSON.stringify(rewards)) }
    return rewards[idx]
  },

  async deleteReward(id) {
    if (supabase) {
      await supabase.from('reward_catalog').delete().eq('id', id)
      return
    }
    const rewards = JSON.parse(localStorage.getItem('manutech_rewards') || '[]').filter(r => r.id !== id)
    localStorage.setItem('manutech_rewards', JSON.stringify(rewards))
  },

  async redeemReward(rewardId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('redeem_reward', { _reward_id: rewardId })
      if (error) throw error
      return data
    }
    // Demo: simulazione
    const rewards = JSON.parse(localStorage.getItem('manutech_rewards') || '[]')
    const reward = rewards.find(r => r.id === rewardId)
    if (!reward) throw new Error('Premio non trovato')
    return { id: `red-${Date.now()}`, reward_name: reward.name, cost: reward.cost, status: 'pending' }
  },

  async getRedemptions(userId = null) {
    if (supabase) {
      let query = supabase.from('reward_redemptions').select('*').order('created_at', { ascending: false })
      if (userId) query = query.eq('user_id', userId)
      const { data } = await query
      return data || []
    }
    return []
  },

  async updateRedemptionStatus(id, status, adminNote = null) {
    if (supabase) {
      const { data, error } = await supabase.from('reward_redemptions')
        .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) throw error
      return data
    }
    return { id, status }
  },
}

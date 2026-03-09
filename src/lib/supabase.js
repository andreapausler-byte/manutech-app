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
  catch { return [] }
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
      created_at: new Date().toISOString(),
    })
    setStore(KEYS.users, users)
  }
}

// ── API unificata (Supabase o localStorage) ──────────────

export const db = {
  // ─── USERS ───
  async getUsers() {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }
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

  async login(email, password) {
    if (supabase) {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError
      const { data: user } = await supabase.from('users').select('*')
        .eq('auth_id', authData.user.id).single()
      if (!user) throw new Error('Profilo utente non trovato')
      return user
    }
    const users = getStore(KEYS.users)
    const user = users.find(u => u.email === email && u.password === password)
    if (!user) throw new Error('Credenziali non valide')
    setStore(KEYS.session, user)
    return user
  },

  async register(userData) {
    if (supabase) {
      // 1. Crea account in auth.users (il trigger creerà il profilo in public.users)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            name: userData.name,
            role: userData.role || 'operatore',
            org_id: userData.org_id || 'default',
          },
        },
      })
      if (authError) throw authError

      // 2. Retry con backoff — il trigger potrebbe impiegare un momento
      let user = null
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
        const { data, error } = await supabase
          .from('users').select('*').eq('auth_id', authData.user.id).maybeSingle()
        if (data) { user = data; break }
      }

      // 3. Fallback — se il trigger non esiste, crea il profilo manualmente
      if (!user) {
        const { data: created, error: insertError } = await supabase
          .from('users').insert({
            auth_id: authData.user.id,
            email: userData.email,
            name: userData.name,
            role: userData.role || 'operatore',
            org_id: userData.org_id || 'default',
          }).select().single()
        if (insertError) throw new Error('Registrazione auth OK ma errore creazione profilo: ' + insertError.message)
        user = created
      }

      return user
    }
    return db.createUser(userData)
  },

  async getSession() {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      // Cerca per auth_id (più affidabile di email)
      const { data: user } = await supabase.from('users').select('*')
        .eq('auth_id', session.user.id).single()
      return user || null
    }
    try { return JSON.parse(localStorage.getItem(KEYS.session)) } catch { return null }
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
      let query = supabase.from('reports').select('*, assigned_to_user:users!reports_assigned_to_fkey(name), created_by_user:users!reports_created_by_fkey(name)').order('created_at', { ascending: false })
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
    return reports
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
      const { data, error } = await supabase.from('reports').update(updates).eq('id', id).select().single()
      if (error) throw error
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

  async createMaintenancePlan(plan) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans').insert(plan).select().single()
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
      const { data, error } = await supabase.from('maintenance_plans').insert(plans).select()
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
      const { data, error } = await supabase.from('maintenance_logs').insert(log).select().single()
      if (error) throw error
      return data
    }
    return { ...log, id: `ml-${Date.now()}`, created_at: new Date().toISOString() }
  },

  async deleteMaintenanceLog(id) {
    if (supabase) {
      const { error } = await supabase.from('maintenance_logs').delete().eq('id', id)
      if (error) throw error
    }
  },

  // ─── FILE STORAGE ───
  async uploadFile(bucket, path, file) {
    if (supabase) {
      // Aggiungi timestamp per evitare conflitti di nome
      const ext = file.name?.split('.').pop() || 'jpg'
      const uniquePath = path || `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage.from(bucket).upload(uniquePath, file, {
        cacheControl: '3600',
        upsert: false,
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
    } catch { return null }
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
    } catch { return null }
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
}

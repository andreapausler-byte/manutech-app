import { supabase, DEMO_ORG_ID, getMyOrgId, resetOrgIdCache } from './_client'
import { KEYS, getStore, setStore, demoToken } from './_demoStore'

export const auth = {
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

  // ─── SIGNUP ORGANIZATION ───
  // Crea una nuova organizzazione + utente admin via supabase.auth.signUp.
  // Il trigger handle_new_user (mig. 032) legge `org_name` dai metadati e crea la
  // riga in `organizations` prima del profilo utente. Se la conferma email è
  // disattivata su Supabase, ritorna una sessione attiva.
  async signupOrganization({ orgName, email, password, adminName }) {
    const cleanOrg = (orgName || '').trim()
    const cleanEmail = (email || '').trim().toLowerCase()
    const cleanName = (adminName || '').trim() || cleanEmail.split('@')[0]
    if (!cleanOrg) throw new Error('Nome organizzazione obbligatorio')
    if (!cleanEmail) throw new Error('Email obbligatoria')
    if (!password || password.length < 8) throw new Error('Password di almeno 8 caratteri')

    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { name: cleanName, role: 'admin', org_name: cleanOrg } },
      })
      if (error) throw new Error(error.message)
      if (!data.session) {
        return { needsEmailConfirmation: true, email: cleanEmail }
      }
      const { data: profile, error: rpcError } = await supabase.rpc('resolve_my_profile')
      if (rpcError) {
        await supabase.auth.signOut()
        throw new Error(rpcError.message)
      }
      resetOrgIdCache()
      return { needsEmailConfirmation: false, profile }
    }

    const users = getStore(KEYS.users)
    if (users.find(u => u.email?.toLowerCase() === cleanEmail)) {
      throw new Error('Esiste già un account con questa email')
    }
    const orgs = JSON.parse(localStorage.getItem('manutech_organizations') || '[]')
    const slug = cleanOrg.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `org-${Date.now()}`
    const newOrg = {
      id: `org-${Date.now()}`, name: cleanOrg, slug,
      plan: 'free', status: 'trial',
      created_at: new Date().toISOString(),
    }
    orgs.push(newOrg)
    localStorage.setItem('manutech_organizations', JSON.stringify(orgs))
    const newUser = {
      id: `user-${Date.now()}`,
      name: cleanName, email: cleanEmail, password,
      role: 'admin', status: 'active', org_id: newOrg.id,
      created_at: new Date().toISOString(),
    }
    users.push(newUser)
    setStore(KEYS.users, users)
    setStore(KEYS.session, newUser)
    return { needsEmailConfirmation: false, profile: newUser }
  },

  async login(email, password) {
    if (supabase) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError
      const { data: profile, error: rpcError } = await supabase.rpc('resolve_my_profile')
      if (rpcError) {
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
      org_id: DEMO_ORG_ID, status: 'pending',
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
      const info = await auth.getInviteInfo(token)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: info.email, password,
        options: { data: { name: info.name, role: info.role } },
      })
      if (authError) throw new Error(authError.message)
      if (!authData.session) {
        return { needsEmailConfirmation: true, email: info.email }
      }
      const { data: profile, error: rpcError } = await supabase.rpc('accept_invite', { _token: token })
      if (rpcError) throw new Error(rpcError.message)
      return { needsEmailConfirmation: false, profile }
    }
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
    else profiles.push({ ...payload, org_id: payload.org_id || DEMO_ORG_ID, created_at: new Date().toISOString() })
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

  // ─── SUPER-ADMIN MODERATION (mig. 036) ───
  async listPendingOrgs() {
    if (supabase) {
      const { data, error } = await supabase.rpc('list_pending_orgs')
      if (error) throw new Error(error.message)
      return data || []
    }
    const orgs = JSON.parse(localStorage.getItem('manutech_organizations') || '[]')
    return orgs.filter(o => (o.approval_status || 'pending') === 'pending')
  },

  async approveOrg(orgId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('approve_org', { _org_id: orgId })
      if (error) throw new Error(error.message)
      return data
    }
    const orgs = JSON.parse(localStorage.getItem('manutech_organizations') || '[]')
    const org = orgs.find(o => o.id === orgId)
    if (!org) throw new Error('Organizzazione non trovata')
    org.approval_status = 'approved'
    org.approved_at = new Date().toISOString()
    org.rejection_reason = null
    localStorage.setItem('manutech_organizations', JSON.stringify(orgs))
    return org
  },

  async rejectOrg(orgId, reason) {
    const trimmed = (reason || '').trim()
    if (trimmed.length < 3) throw new Error('Motivo del rifiuto richiesto (min 3 caratteri)')
    if (supabase) {
      const { data, error } = await supabase.rpc('reject_org', { _org_id: orgId, _reason: trimmed })
      if (error) throw new Error(error.message)
      return data
    }
    const orgs = JSON.parse(localStorage.getItem('manutech_organizations') || '[]')
    const org = orgs.find(o => o.id === orgId)
    if (!org) throw new Error('Organizzazione non trovata')
    org.approval_status = 'rejected'
    org.approved_at = new Date().toISOString()
    org.rejection_reason = trimmed
    localStorage.setItem('manutech_organizations', JSON.stringify(orgs))
    return org
  },

  async getSession() {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
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
}

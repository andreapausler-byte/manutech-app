import { supabase, supabaseUrl, supabaseAnonKey, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

export const notifications = {
  // ─── NOTIFICATIONS ───
  async addNotification(notification) {
    if (supabase) {
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
  async savePushSubscription(userId, subscription, orgId) {
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

  // ─── PREFS DB (per-utente) ───
  async getUserNotifPrefs(userId) {
    if (supabase) {
      const { data, error } = await supabase.from('notification_preferences')
        .select('prefs').eq('user_id', userId).eq('is_org_default', false).maybeSingle()
      if (error) throw error
      return data?.prefs || null
    }
    try {
      const raw = localStorage.getItem(`manutech_notif_prefs_${userId}`)
      return raw ? JSON.parse(raw) : null
    } catch (e) { console.warn('[ManuTech] Preferenze notifiche corrotte:', e.message); return null }
  },

  async saveUserNotifPrefs(userId, prefs, orgId) {
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

  async getOrgNotifDefaults(orgId) {
    if (supabase) {
      if (!orgId) return null
      const { data, error } = await supabase.from('notification_preferences')
        .select('role, prefs').eq('org_id', orgId).eq('is_org_default', true)
      if (error) throw error
      if (!data || data.length === 0) return null
      const result = {}
      data.forEach(row => { result[row.role] = row.prefs })
      return result
    }
    try {
      const raw = localStorage.getItem('manutech_notif_org_defaults')
      return raw ? JSON.parse(raw) : null
    } catch (e) { console.warn('[ManuTech] Default org notifiche corrotti:', e.message); return null }
  },

  async saveOrgNotifDefaults(orgId, role, prefs) {
    if (supabase) {
      // UNIQUE è su user_id (e NULL non matcha): delete+insert per ruolo
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
}

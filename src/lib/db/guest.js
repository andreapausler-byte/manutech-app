import { supabase, supabaseUrl, supabaseAnonKey, DEMO_ORG_ID, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

export const guest = {
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
    const newToken = { id: `gt-${Date.now()}`, report_id: reportId, token, enabled: true, org_id: DEMO_ORG_ID, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }
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

  // Guest endpoints (no auth — call Edge Function or localStorage)
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
}

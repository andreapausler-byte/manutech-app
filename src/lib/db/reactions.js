import { supabase, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'
import { wallet } from './wallet'

// Reazioni sui messaggi chat (utile/confermo/risolto) e ringraziamenti
// a livello segnalazione (type='grazie', comment_id NULL). Tabella
// `reactions` (migration 059). In demo mode le reazioni vivono embedded
// nel report (`report.reactions`), come i commenti.

export const reactions = {
  async getReactions(reportId) {
    if (supabase) {
      const { data, error } = await supabase.from('reactions').select('*').eq('report_id', reportId).order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    }
    const report = getStore(KEYS.reports).find(r => r.id === reportId)
    return report?.reactions || []
  },

  async addReaction(reportId, reaction) {
    if (supabase) {
      let insertData = { ...reaction, report_id: reportId }
      if (!insertData.org_id) insertData.org_id = await getMyOrgId()
      const { data, error } = await supabase.from('reactions').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const list = getStore(KEYS.reports)
    const idx = list.findIndex(r => r.id === reportId)
    if (idx === -1) throw new Error('Segnalazione non trovata')
    const newReaction = { ...reaction, id: `rea-${Date.now()}`, report_id: reportId, created_at: new Date().toISOString() }
    list[idx].reactions = [...(list[idx].reactions || []), newReaction]
    setStore(KEYS.reports, list)
    return newReaction
  },

  async removeReaction(id) {
    if (supabase) {
      const { error } = await supabase.from('reactions').delete().eq('id', id)
      if (error) throw error
      return
    }
    const list = getStore(KEYS.reports)
    const idx = list.findIndex(r => r.reactions?.some(x => x.id === id))
    if (idx === -1) return
    list[idx].reactions = list[idx].reactions.filter(x => x.id !== id)
    setStore(KEYS.reports, list)
  },

  // ─── "Mi è servita" sulla chiusura (type='servito', migration 064) ───
  // In supabase i 5 ManuCoin al tecnico della chiusura li accredita il
  // trigger, una volta per collega. In demo lo stesso lo fa il client,
  // con la stessa deduplica su reference_id.
  async markClosureHelpful(report, user) {
    const created = await reactions.addReaction(report.id, {
      type: 'servito', comment_id: null,
      user_id: user.id, user_name: user.name,
    })
    if (!supabase && report.assigned_to && report.assigned_to !== user.id) {
      const ref = `${report.id}:${user.id}`
      const txs = JSON.parse(localStorage.getItem('manutech_token_tx') || '[]')
      if (!txs.some(t => t.reason_code === 'closure_helpful' && t.reference_id === ref)) {
        await wallet.creditTokens(
          report.assigned_to, 5,
          `La tua chiusura è servita a ${user.name || 'un collega'} — ${report.title}`,
          'closure_helpful', ref,
        )
      }
    }
    return created
  },

  // Quanti colleghi hanno trovato utile ogni chiusura: { reportId: n }.
  async getHelpfulCounts(reportIds) {
    if (!reportIds?.length) return {}
    let rows = []
    if (supabase) {
      const { data, error } = await supabase.from('reactions')
        .select('report_id')
        .eq('type', 'servito')
        .is('comment_id', null)
        .in('report_id', reportIds)
      // Migration 064 non ancora applicata: nessun voto, nessun errore a schermo.
      if (error) { console.warn('[ManuTech] getHelpfulCounts:', error.message); return {} }
      rows = data || []
    } else {
      const ids = new Set(reportIds)
      rows = getStore(KEYS.reports)
        .filter(r => ids.has(r.id))
        .flatMap(r => (r.reactions || []).filter(x => x.type === 'servito' && !x.comment_id))
    }
    const map = {}
    for (const r of rows) map[r.report_id] = (map[r.report_id] || 0) + 1
    return map
  },

  // Totale 👏 ricevuti sulle segnalazioni assegnate all'utente (profilo tecnico).
  async getThanksReceived(userId) {
    if (supabase) {
      const { data, error } = await supabase
        .from('reactions')
        .select('id, reports!inner(assigned_to)')
        .eq('type', 'grazie')
        .is('comment_id', null)
        .eq('reports.assigned_to', userId)
      if (error) throw error
      return data?.length || 0
    }
    return getStore(KEYS.reports)
      .filter(r => r.assigned_to === userId)
      .reduce((n, r) => n + (r.reactions || []).filter(x => x.type === 'grazie' && !x.comment_id).length, 0)
  },
}

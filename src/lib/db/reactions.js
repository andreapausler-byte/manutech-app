import { supabase, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

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

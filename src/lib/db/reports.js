import { supabase, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

export const reports = {
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
    let list = getStore(KEYS.reports)
    if (filters.status) list = list.filter(r => r.status === filters.status)
    if (filters.severity) list = list.filter(r => r.severity === filters.severity)
    return list.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
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
    const list = getStore(KEYS.reports)
    const newReport = { ...report, id: `rep-${Date.now()}`, created_at: new Date().toISOString(), status: 'aperta', comments: [] }
    list.unshift(newReport)
    setStore(KEYS.reports, list)
    return newReport
  },

  async updateReport(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('reports').update(updates).eq('id', id).select().maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Permessi insufficienti: impossibile aggiornare questa segnalazione')
      return data
    }
    const list = getStore(KEYS.reports)
    const idx = list.findIndex(r => r.id === id)
    if (idx === -1) throw new Error('Segnalazione non trovata')
    list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() }
    setStore(KEYS.reports, list)
    return list[idx]
  },

  async deleteReport(id) {
    if (supabase) {
      const { error } = await supabase.from('reports').delete().eq('id', id)
      if (error) throw error
      return
    }
    const list = getStore(KEYS.reports).filter(r => r.id !== id)
    setStore(KEYS.reports, list)
  },

  // ─── COMMENTS ───
  async getComments(reportId) {
    if (supabase) {
      // Fallback graceful: se la migration 042 non e' applicata, la colonna
      // deleted_at non esiste e il filtro fallisce. Ritentiamo senza filtro.
      let { data, error } = await supabase.from('comments').select('*, user:users(name, role)').eq('report_id', reportId).is('deleted_at', null).order('created_at', { ascending: true })
      if (error) {
        console.warn('[ManuTech] getComments con filtro deleted_at fallito, retry base:', error.message)
        const retry = await supabase.from('comments').select('*, user:users(name, role)').eq('report_id', reportId).order('created_at', { ascending: true })
        if (retry.error) throw retry.error
        data = retry.data
      }
      return data || []
    }
    const report = getStore(KEYS.reports).find(r => r.id === reportId)
    return (report?.comments || []).filter(c => !c.deleted_at)
  },

  async getLastCommentsByReports(reportIds) {
    if (!reportIds?.length) return {}
    if (supabase) {
      const { data, error } = await supabase
        .from('comments')
        .select('report_id, text, user_name, user_role, media, created_at')
        .in('report_id', reportIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      const map = {}
      for (const c of (data || [])) {
        if (!map[c.report_id]) map[c.report_id] = c
      }
      return map
    }
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
      let insertData = { ...comment, report_id: reportId }
      if (!insertData.org_id) insertData.org_id = await getMyOrgId()
      const { data, error } = await supabase.from('comments').insert(insertData).select('*, user:users(name, role)').single()
      if (error) throw error
      return data
    }
    const list = getStore(KEYS.reports)
    const idx = list.findIndex(r => r.id === reportId)
    if (idx === -1) throw new Error('Segnalazione non trovata')
    const newComment = { ...comment, id: `com-${Date.now()}`, created_at: new Date().toISOString() }
    list[idx].comments = [...(list[idx].comments || []), newComment]
    setStore(KEYS.reports, list)
    return newComment
  },

  // Modifica testo di un commento esistente. Solo autore o admin via RPC.
  // L'audio + extra_data + media restano intatti, si aggiorna solo `text`
  // e si traccia la modifica in edit_history + edited_at + original_text.
  async updateComment(commentId, newText) {
    if (supabase) {
      const { data, error } = await supabase.rpc('update_comment', {
        _comment_id: commentId,
        _new_text: newText,
      })
      if (error) throw new Error(error.message)
      return data
    }
    // Demo fallback: cerca il commento in tutti i report e aggiornalo
    const list = getStore(KEYS.reports)
    for (const report of list) {
      const idx = (report.comments || []).findIndex(c => c.id === commentId)
      if (idx !== -1) {
        const c = report.comments[idx]
        const now = new Date().toISOString()
        if (c.text !== newText) {
          c.edit_history = [
            ...(c.edit_history || []),
            { text: c.text, edited_at: c.edited_at || c.created_at, edited_by_name: 'demo' },
          ]
          c.original_text = c.original_text || c.text
          c.text = newText
          c.edited_at = now
        }
        setStore(KEYS.reports, list)
        return c
      }
    }
    throw new Error('Commento non trovato')
  },

  // Soft delete di un commento (set deleted_at + deleted_by).
  async deleteComment(commentId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('delete_comment', {
        _comment_id: commentId,
      })
      if (error) throw new Error(error.message)
      return data
    }
    const list = getStore(KEYS.reports)
    for (const report of list) {
      const idx = (report.comments || []).findIndex(c => c.id === commentId)
      if (idx !== -1) {
        report.comments[idx].deleted_at = new Date().toISOString()
        report.comments[idx].deleted_by = 'demo'
        setStore(KEYS.reports, list)
        return report.comments[idx]
      }
    }
    throw new Error('Commento non trovato')
  },
}

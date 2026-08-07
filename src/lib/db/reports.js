import { supabase, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'
import { julianDay, isTerminalStatus } from '../constants'

// Demo-mode: replica la logica del trigger DB (migration 049) per generare
// un display_id consistente. In supabase mode non viene usato (il trigger
// fa tutto sul server e il record ritorna già con display_id).
function computeDisplayIdDemo(orgId, createdAt, allReports) {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const yy = String(d.getFullYear() % 100).padStart(2, '0')
  const jjj = String(julianDay(d)).padStart(3, '0')
  const sameDay = (allReports || []).filter(r => {
    if ((r.org_id || 'demo') !== (orgId || 'demo')) return false
    const rd = new Date(r.created_at)
    return String(rd.getFullYear() % 100).padStart(2, '0') === yy
        && String(julianDay(rd)).padStart(3, '0') === jjj
  })
  const seq = sameDay.length + 1
  const seqStr = seq < 100 ? String(seq).padStart(2, '0') : String(seq)
  return `TK-${yy}${jjj}-${seqStr}`
}

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
    const createdAt = new Date().toISOString()
    const display_id = computeDisplayIdDemo(report.org_id, createdAt, list)
    const newReport = {
      ...report,
      id: `rep-${Date.now()}`,
      display_id,
      created_at: createdAt,
      status: 'aperta',
      comments: [],
    }
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

  // ─── ATTIVITÀ CHAT PER LE LISTE ───
  // Aggregato bulk per la lista admin: per ogni report il numero di messaggi,
  // i non letti dell'utente (commenti altrui dopo chat_reads.last_read_at) e
  // il feedback sui messaggi contato per utenti distinti — chi conferma 3
  // messaggi vale 1 persona, non 3. Il 👏 'grazie' (comment_id NULL) resta
  // fuori: è un ringraziamento, non un segnale di importanza del ticket.
  // 3 query bulk + merge client-side, niente N+1 sulla lista.
  async getReportsActivity(reportIds, userId) {
    const emptyActivity = () => ({
      comment_count: 0,
      unread_count: 0,
      last_comment_at: null,
      reactions: { utile: 0, confermo: 0, risolto: 0 },
    })
    if (!reportIds?.length) return {}

    let comments = []
    let reactionRows = []
    let reads = null // null = tracciamento letture non disponibile → 0 non letti

    if (supabase) {
      // Commenti: esclude i soft-deleted (mig 042), con retry senza filtro
      // se la colonna non esiste — stesso pattern di getComments.
      let res = await supabase.from('comments')
        .select('report_id, user_id, created_at')
        .in('report_id', reportIds)
        .is('deleted_at', null)
      if (res.error) {
        res = await supabase.from('comments')
          .select('report_id, user_id, created_at')
          .in('report_id', reportIds)
      }
      comments = res.data || []

      // Reazioni: se la migration 059 non è applicata, fallback a vuoto.
      const rea = await supabase.from('reactions')
        .select('report_id, comment_id, user_id, type')
        .in('report_id', reportIds)
      if (rea.error) console.warn('[ManuTech] getReportsActivity reactions:', rea.error.message)
      reactionRows = rea.data || []

      if (userId) {
        const rd = await supabase.from('chat_reads')
          .select('report_id, last_read_at')
          .eq('user_id', userId)
        if (!rd.error) reads = rd.data || []
      }
    } else {
      const all = getStore(KEYS.reports).filter(r => reportIds.includes(r.id))
      comments = all.flatMap(r =>
        (r.comments || []).filter(c => !c.deleted_at).map(c => ({ ...c, report_id: r.id }))
      )
      reactionRows = all.flatMap(r => r.reactions || [])
      if (userId) reads = getStore(KEYS.chatReads).filter(x => x.user_id === userId)
    }

    const lastReadByReport = {}
    for (const r of reads || []) lastReadByReport[r.report_id] = r.last_read_at

    const map = {}
    const entryFor = id => map[id] || (map[id] = { ...emptyActivity(), _voters: { utile: new Set(), confermo: new Set(), risolto: new Set() } })

    for (const c of comments) {
      const a = entryFor(c.report_id)
      a.comment_count++
      if (!a.last_comment_at || c.created_at > a.last_comment_at) a.last_comment_at = c.created_at
      const lastRead = lastReadByReport[c.report_id]
      if (reads && userId && c.user_id !== userId && (!lastRead || new Date(c.created_at) > new Date(lastRead))) {
        a.unread_count++
      }
    }

    for (const x of reactionRows) {
      if (!x.comment_id) continue
      const voters = entryFor(x.report_id)._voters[x.type]
      if (voters) voters.add(x.user_id)
    }

    for (const a of Object.values(map)) {
      a.reactions = { utile: a._voters.utile.size, confermo: a._voters.confermo.size, risolto: a._voters.risolto.size }
      delete a._voters
    }
    return map
  },

  // Segna la chat di un report come letta (upsert su chat_reads, mig 003).
  // Stessa scrittura di useChatRealtime.markAsRead, esposta nel facade per
  // le superfici senza hook realtime (lista admin desktop).
  async markChatRead(reportId, userId) {
    if (!reportId || !userId) return
    if (supabase) {
      const { error } = await supabase.from('chat_reads').upsert(
        { user_id: userId, report_id: reportId, last_read_at: new Date().toISOString() },
        { onConflict: 'user_id,report_id' }
      )
      if (error) console.warn('[ManuTech] markChatRead:', error.message)
      return
    }
    const all = getStore(KEYS.chatReads).filter(x => !(x.report_id === reportId && x.user_id === userId))
    all.push({ report_id: reportId, user_id: userId, last_read_at: new Date().toISOString() })
    setStore(KEYS.chatReads, all)
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
    const now = new Date().toISOString()
    const newComment = { ...comment, id: `com-${Date.now()}`, created_at: now }
    // Parità col trigger DB 050: ogni commento "tocca" updated_at del report
    // così la lista admin ordinata per ultima attività riflette la chat.
    list[idx].comments = [...(list[idx].comments || []), newComment]
    list[idx].updated_at = now
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

  // ─── STARS (preferiti personali per admin) ───
  // Ogni admin pinna i propri ticket in cima alla lista. RLS scoped sul
  // public.users.id corrispondente all'auth.uid() della sessione (vedi
  // migration 052). Ritorna un Set di report_id per lookup O(1) in UI.
  async getStarredReportIds(userId) {
    if (!userId) return new Set()
    if (supabase) {
      const { data, error } = await supabase
        .from('report_stars')
        .select('report_id')
        .eq('user_id', userId)
      if (error) {
        // Migration 052 non ancora applicata: fallback silenzioso a vuoto
        console.warn('[ManuTech] getStarredReportIds:', error.message)
        return new Set()
      }
      return new Set((data || []).map(r => r.report_id))
    }
    const all = getStore(KEYS.reportStars)
    return new Set(all.filter(s => s.user_id === userId).map(s => s.report_id))
  },

  // Toggle idempotente: starred=true → upsert, starred=false → delete.
  async toggleReportStar(userId, reportId, starred) {
    if (!userId || !reportId) return
    if (supabase) {
      if (starred) {
        // ignoreDuplicates: true → ON CONFLICT DO NOTHING. Senza questo flag
        // supabase-js genera DO UPDATE che richiede policy UPDATE (assente in
        // migration 052 by design: per pinnare basta INSERT, per togliere DELETE).
        const { error } = await supabase
          .from('report_stars')
          .upsert({ user_id: userId, report_id: reportId }, {
            onConflict: 'user_id,report_id',
            ignoreDuplicates: true,
          })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('report_stars')
          .delete()
          .eq('user_id', userId)
          .eq('report_id', reportId)
        if (error) throw error
      }
      return
    }
    const all = getStore(KEYS.reportStars)
    const filtered = all.filter(s => !(s.user_id === userId && s.report_id === reportId))
    if (starred) filtered.push({ user_id: userId, report_id: reportId, starred_at: new Date().toISOString() })
    setStore(KEYS.reportStars, filtered)
  },

  // ─── MERGE DUPLICATI (migration 058) ───
  // Unisce la segnalazione `duplicateId` alla `masterId`: la duplicata viene
  // chiusa (status='chiuso', closed_reason='duplicato') e linkata via
  // duplicate_of_id. Atomico e reversibile (unmergeReport). La logica vera e le
  // validazioni vivono nella RPC SECURITY DEFINER `merge_reports`; qui solo il
  // dispatch + un fallback demo che replica gli stessi vincoli su localStorage.
  async mergeReports(duplicateId, masterId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('merge_reports', {
        p_duplicate_id: duplicateId,
        p_master_id: masterId,
      })
      if (error) throw new Error(error.message)
      return data
    }
    // Demo: replica i vincoli della RPC su localStorage.
    if (duplicateId === masterId) throw new Error('Una segnalazione non può essere duplicato di sé stessa')
    const list = getStore(KEYS.reports)
    const dup = list.find(r => r.id === duplicateId)
    const master = list.find(r => r.id === masterId)
    if (!dup || !master) throw new Error('Segnalazione non trovata')
    if (dup.duplicate_of_id) throw new Error("La segnalazione è già stata unita a un'altra")
    if (master.duplicate_of_id) throw new Error('La destinazione è essa stessa un duplicato: unisci direttamente alla segnalazione principale')
    if (list.some(r => r.duplicate_of_id === dup.id)) throw new Error('Questa segnalazione include altre segnalazioni unite: scollegale prima')
    if (isTerminalStatus(master.status)) throw new Error('La destinazione è chiusa: scegli una segnalazione attiva')
    const now = new Date().toISOString()
    dup.status = 'chiuso'
    dup.closed_reason = 'duplicato'
    dup.duplicate_of_id = masterId
    dup.merged_at = now
    dup.merged_by = null
    dup.updated_at = now
    setStore(KEYS.reports, list)
    return { ...dup }
  },

  // Reverte un merge: ripristina lo stato pre-merge ('assegnata' se assegnatario
  // presente, altrimenti 'aperta') e azzera i campi di unione.
  async unmergeReport(duplicateId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('unmerge_report', {
        p_duplicate_id: duplicateId,
      })
      if (error) throw new Error(error.message)
      return data
    }
    const list = getStore(KEYS.reports)
    const dup = list.find(r => r.id === duplicateId)
    if (!dup) throw new Error('Segnalazione non trovata')
    if (!dup.duplicate_of_id) throw new Error('Questa segnalazione non è unita ad alcuna master')
    dup.status = dup.assigned_to ? 'assegnata' : 'aperta'
    dup.closed_reason = null
    dup.duplicate_of_id = null
    dup.merged_at = null
    dup.merged_by = null
    dup.updated_at = new Date().toISOString()
    setStore(KEYS.reports, list)
    return { ...dup }
  },
}

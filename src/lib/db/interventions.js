import { supabase, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

// Helper: scrive una riga in activities legata all'intervento (e opzionalmente
// al report di origine). Inline qui invece di usare activities.addActivity per
// evitare il vincolo storico `(reportId, activity)` di quella firma.
async function logActivity({ intervention_id, report_id, type, from_status, to_status, detail, user_id, user_name, org_id }) {
  if (supabase) {
    const insertData = {
      intervention_id,
      report_id: report_id || null,
      type,
      from_status: from_status || null,
      to_status: to_status || null,
      detail: detail || null,
      user_id: user_id || null,
      user_name: user_name || null,
      org_id: org_id || (await getMyOrgId()),
    }
    const { error } = await supabase.from('activities').insert(insertData)
    if (error) console.warn('[interventions] logActivity error:', error.message)
    return
  }
  const list = getStore(KEYS.activities)
  list.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    intervention_id,
    report_id: report_id || null,
    type, from_status, to_status, detail,
    user_id, user_name,
    created_at: new Date().toISOString(),
  })
  setStore(KEYS.activities, list)
}

// Helper: notifica all'assegnatario quando viene creato/cambiato un intervento.
async function notifyAssignee({ intervention_id, target_user, from_user, type, title, body, org_id }) {
  if (!target_user) return
  if (supabase) {
    const insertData = {
      intervention_id,
      target_user,
      from_user: from_user || null,
      type,
      title,
      body: body || null,
      org_id: org_id || (await getMyOrgId()),
    }
    const { error } = await supabase.from('notifications').insert(insertData)
    if (error) console.warn('[interventions] notifyAssignee error:', error.message)
    return
  }
  const list = getStore(KEYS.notifications)
  list.unshift({
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    intervention_id, target_user, from_user, type, title, body,
    read: false,
    created_at: new Date().toISOString(),
  })
  if (list.length > 100) list.length = 100
  setStore(KEYS.notifications, list)
}

// Aggrega un array di righe in un dizionario { key: count }. Helper interno
// per i counter del picker (getActiveInterventionsCountByUser etc).
function groupCountBy(rows, key) {
  const map = {}
  for (const row of rows) {
    const k = row?.[key]
    if (!k) continue
    map[k] = (map[k] || 0) + 1
  }
  return map
}

export const interventions = {
  // ─── READ ───────────────────────────────────────────────────────────
  async getInterventions(filters = {}) {
    if (supabase) {
      let query = supabase.from('interventions').select('*').order('scheduled_start_at', { ascending: true, nullsFirst: false })
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.statuses) query = query.in('status', filters.statuses)
      if (filters.type) query = query.eq('type', filters.type)
      if (filters.types) query = query.in('type', filters.types)
      if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
      if (filters.assigned_to_role) query = query.eq('assigned_to_role', filters.assigned_to_role)
      if (filters.report_id) query = query.eq('report_id', filters.report_id)
      if (filters.maintenance_plan_id) query = query.eq('maintenance_plan_id', filters.maintenance_plan_id)
      if (filters.machine_id) query = query.eq('machine_id', filters.machine_id)
      const { data, error } = await query
      if (error) throw error
      return data || []
    }
    let list = getStore(KEYS.interventions)
    if (filters.status) list = list.filter(i => i.status === filters.status)
    if (filters.statuses) list = list.filter(i => filters.statuses.includes(i.status))
    if (filters.type) list = list.filter(i => i.type === filters.type)
    if (filters.types) list = list.filter(i => filters.types.includes(i.type))
    if (filters.assigned_to) list = list.filter(i => i.assigned_to === filters.assigned_to)
    if (filters.assigned_to_role) list = list.filter(i => i.assigned_to_role === filters.assigned_to_role)
    if (filters.report_id) list = list.filter(i => i.report_id === filters.report_id)
    if (filters.maintenance_plan_id) list = list.filter(i => i.maintenance_plan_id === filters.maintenance_plan_id)
    if (filters.machine_id) list = list.filter(i => i.machine_id === filters.machine_id)
    return list.sort((a, b) => {
      const da = a.scheduled_start_at ? new Date(a.scheduled_start_at).getTime() : Infinity
      const db = b.scheduled_start_at ? new Date(b.scheduled_start_at).getTime() : Infinity
      return da - db
    })
  },

  // Range query usata dal calendario. scope = 'all' | 'mine' | 'pending_supplier'.
  async getInterventionsCalendar({ rangeStart, rangeEnd, scope = 'all', currentUserId, filters = {} } = {}) {
    const startISO = rangeStart instanceof Date ? rangeStart.toISOString() : rangeStart
    const endISO = rangeEnd instanceof Date ? rangeEnd.toISOString() : rangeEnd

    if (supabase) {
      let query = supabase.from('interventions').select('*')
        .gte('scheduled_start_at', startISO)
        .lte('scheduled_start_at', endISO)
        .order('scheduled_start_at', { ascending: true })

      if (scope === 'mine' && currentUserId) query = query.eq('assigned_to', currentUserId)
      if (scope === 'pending_supplier') query = query.eq('status', 'pianificato').eq('assigned_to_role', 'fornitore')
      if (filters.types?.length) query = query.in('type', filters.types)
      if (filters.statuses?.length) query = query.in('status', filters.statuses)
      if (filters.severities?.length) query = query.in('severity', filters.severities)

      const { data, error } = await query
      if (error) throw error
      return data || []
    }

    let list = getStore(KEYS.interventions)
    const startMs = new Date(startISO).getTime()
    const endMs = new Date(endISO).getTime()
    list = list.filter(i => {
      if (!i.scheduled_start_at) return false
      const t = new Date(i.scheduled_start_at).getTime()
      return t >= startMs && t <= endMs
    })
    if (scope === 'mine' && currentUserId) list = list.filter(i => i.assigned_to === currentUserId)
    if (scope === 'pending_supplier') list = list.filter(i => i.status === 'pianificato' && i.assigned_to_role === 'fornitore')
    if (filters.types?.length) list = list.filter(i => filters.types.includes(i.type))
    if (filters.statuses?.length) list = list.filter(i => filters.statuses.includes(i.status))
    if (filters.severities?.length) list = list.filter(i => filters.severities.includes(i.severity))
    return list.sort((a, b) => new Date(a.scheduled_start_at) - new Date(b.scheduled_start_at))
  },

  async getIntervention(id) {
    if (!id) return null
    if (supabase) {
      const { data, error } = await supabase.from('interventions').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    }
    return getStore(KEYS.interventions).find(i => i.id === id) || null
  },

  async getInterventionsForReport(reportId) {
    if (!reportId) return []
    return this.getInterventions({ report_id: reportId })
  },

  async getInterventionsForSupplier(userId) {
    if (!userId) return []
    return this.getInterventions({ assigned_to: userId })
  },

  // Lookup planning_state aggregato per una lista di report. Usato dal badge
  // della lista admin segnalazioni. Legge la view reports_with_planning quando
  // Supabase è configurato; in demo mode lo calcola in-memory.
  async getPlanningStateForReports(reportIds) {
    if (!reportIds?.length) return {}
    if (supabase) {
      const { data, error } = await supabase
        .from('reports_with_planning')
        .select('id, planning_state, active_interventions_count, next_intervention_at')
        .in('id', reportIds)
      if (error) {
        console.warn('[interventions] getPlanningStateForReports view non disponibile:', error.message)
        return {}
      }
      const map = {}
      for (const row of (data || [])) {
        map[row.id] = {
          planning_state: row.planning_state,
          active_count: row.active_interventions_count,
          next_at: row.next_intervention_at,
        }
      }
      return map
    }
    // Demo: ricalcola da interventions in localStorage
    const all = getStore(KEYS.interventions)
    const reports = getStore(KEYS.reports)
    const map = {}
    for (const id of reportIds) {
      const r = reports.find(rep => rep.id === id)
      const linked = all.filter(i => i.report_id === id)
      const active = linked.filter(i => !['annullato', 'completato'].includes(i.status))
      let state = 'altro'
      if (active.length === 0 && r?.status === 'aperta') state = 'da_pianificare'
      else if (active.some(i => i.status === 'in_corso')) state = 'in_corso'
      else if (active.some(i => ['pianificato', 'confermato'].includes(i.status))) state = 'pianificato'
      else if (r?.status === 'risolta') state = 'risolta'
      const nextAt = active
        .map(i => i.scheduled_start_at)
        .filter(Boolean)
        .sort()[0] || null
      map[id] = { planning_state: state, active_count: active.length, next_at: nextAt }
    }
    return map
  },

  // Contatore "interventi attivi" per utente assegnatario. Usato dal picker
  // assigned_to nel form per mostrare il carico di lavoro di ciascun tecnico.
  // Status considerati attivi: pianificato, confermato, in_corso.
  // Ritorna { [userId]: count }.
  async getActiveInterventionsCountByUser() {
    if (supabase) {
      // RLS filtra per org_id automaticamente. Fetch solo assigned_to.
      const { data, error } = await supabase
        .from('interventions')
        .select('assigned_to')
        .in('status', ['pianificato', 'confermato', 'in_corso'])
        .not('assigned_to', 'is', null)
      if (error) {
        console.warn('[interventions] getActiveInterventionsCountByUser:', error.message)
        return {}
      }
      return groupCountBy(data || [], 'assigned_to')
    }
    const list = getStore(KEYS.interventions).filter(i =>
      ['pianificato', 'confermato', 'in_corso'].includes(i.status) && i.assigned_to
    )
    return groupCountBy(list, 'assigned_to')
  },

  // Contatore "interventi completati su questa macchina" per utente assegnatario.
  // Usato dal picker per mostrare l'esperienza storica sull'asset specifico.
  // Ritorna { [userId]: count }.
  async getCompletedInterventionsCountByUserMachine(machineId) {
    if (!machineId) return {}
    if (supabase) {
      const { data, error } = await supabase
        .from('interventions')
        .select('assigned_to')
        .eq('machine_id', machineId)
        .eq('status', 'completato')
        .not('assigned_to', 'is', null)
      if (error) {
        console.warn('[interventions] getCompletedInterventionsCountByUserMachine:', error.message)
        return {}
      }
      return groupCountBy(data || [], 'assigned_to')
    }
    const list = getStore(KEYS.interventions).filter(i =>
      i.machine_id === machineId && i.status === 'completato' && i.assigned_to
    )
    return groupCountBy(list, 'assigned_to')
  },

  // Combinatore: carica entrambi i counter in parallelo. Usato dal form per
  // popolare i picker assigned_to e supervised_by con dati arricchiti in un
  // solo passaggio. Ritorna { active: {...}, completedOnMachine: {...} }.
  async getUserPickerCounters({ machineId } = {}) {
    const [active, completedOnMachine] = await Promise.all([
      this.getActiveInterventionsCountByUser(),
      machineId ? this.getCompletedInterventionsCountByUserMachine(machineId) : Promise.resolve({}),
    ])
    return { active, completedOnMachine }
  },

  // ─── WRITE ──────────────────────────────────────────────────────────
  // data = { type, severity, status?, title, description?, machine_id, machine_name,
  //          report_id?, maintenance_plan_id?, origin, assigned_to?, assigned_to_name?,
  //          assigned_to_role?, supervised_by?, supervised_by_name?,
  //          scheduled_start_at?, scheduled_end_at?,
  //          estimated_duration_min?, location?, planning_notes?, media?, extra_data?,
  //          created_by, created_by_name, org_id? }
  async createIntervention(data) {
    const orgId = data.org_id || (supabase ? await getMyOrgId() : 'demo-org')
    const payload = {
      type: data.type || 'correttiva',
      severity: data.severity || 'media',
      status: data.status || (data.scheduled_start_at ? 'pianificato' : 'bozza'),
      title: data.title,
      description: data.description || '',
      machine_id: data.machine_id || null,
      machine_name: data.machine_name || null,
      report_id: data.report_id || null,
      maintenance_plan_id: data.maintenance_plan_id || null,
      origin: data.origin || (data.report_id ? 'report' : (data.maintenance_plan_id ? 'maintenance_plan' : 'manuale')),
      assigned_to: data.assigned_to || null,
      assigned_to_name: data.assigned_to_name || null,
      assigned_to_role: data.assigned_to_role || null,
      supervised_by: data.supervised_by || null,
      supervised_by_name: data.supervised_by_name || null,
      scheduled_start_at: data.scheduled_start_at || null,
      scheduled_end_at: data.scheduled_end_at || null,
      estimated_duration_min: data.estimated_duration_min || null,
      location: data.location || null,
      planning_notes: data.planning_notes || null,
      created_by: data.created_by || null,
      created_by_name: data.created_by_name || null,
      media: data.media || [],
      extra_data: data.extra_data || {},
      org_id: orgId,
    }

    let inserted
    if (supabase) {
      const { data: row, error } = await supabase.from('interventions').insert(payload).select().single()
      if (error) throw error
      inserted = row
    } else {
      const list = getStore(KEYS.interventions)
      inserted = {
        ...payload,
        id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      list.unshift(inserted)
      setStore(KEYS.interventions, list)
    }

    // Activity log
    await logActivity({
      intervention_id: inserted.id,
      report_id: inserted.report_id,
      type: 'intervention_created',
      to_status: inserted.status,
      detail: inserted.title,
      user_id: inserted.created_by,
      user_name: inserted.created_by_name,
      org_id: orgId,
    })

    // Notifica all'assegnatario, se presente
    if (inserted.assigned_to) {
      await notifyAssignee({
        intervention_id: inserted.id,
        target_user: inserted.assigned_to,
        from_user: inserted.created_by,
        type: 'intervention_assigned',
        title: 'Nuovo intervento assegnato',
        body: inserted.title,
        org_id: orgId,
      })
    }

    return inserted
  },

  async updateIntervention(id, updates) {
    const before = await this.getIntervention(id)
    if (!before) throw new Error('Intervento non trovato')

    // Estrai i metadati "actor" che NON sono colonne della tabella: servono
    // solo per popolare l'activity log e l'eventuale notifica. Se finissero
    // nel .update() PostgREST risponderebbe "column not found in schema cache".
    const { updated_by_user_id, updated_by_user_name, ...dbUpdates } = updates

    let after
    if (supabase) {
      const { data, error } = await supabase.from('interventions').update(dbUpdates).eq('id', id).select().maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Permessi insufficienti: impossibile aggiornare questo intervento')
      after = data
    } else {
      const list = getStore(KEYS.interventions)
      const idx = list.findIndex(i => i.id === id)
      if (idx === -1) throw new Error('Intervento non trovato')
      list[idx] = { ...list[idx], ...dbUpdates, updated_at: new Date().toISOString() }
      setStore(KEYS.interventions, list)
      after = list[idx]
    }

    // Activity logs differenziati per quale campo è cambiato
    const orgId = after.org_id
    if (before.assigned_to !== after.assigned_to) {
      await logActivity({
        intervention_id: id,
        report_id: after.report_id,
        type: before.assigned_to ? 'intervention_reassigned' : 'intervention_assigned',
        detail: after.assigned_to_name || null,
        user_id: updated_by_user_id || null,
        user_name: updated_by_user_name || null,
        org_id: orgId,
      })
      if (after.assigned_to) {
        await notifyAssignee({
          intervention_id: id,
          target_user: after.assigned_to,
          from_user: updated_by_user_id || null,
          type: 'intervention_assigned',
          title: 'Nuovo intervento assegnato',
          body: after.title,
          org_id: orgId,
        })
      }
    }
    if (before.status !== after.status) {
      await logActivity({
        intervention_id: id,
        report_id: after.report_id,
        type: 'intervention_status_changed',
        from_status: before.status,
        to_status: after.status,
        user_id: updated_by_user_id || null,
        user_name: updated_by_user_name || null,
        org_id: orgId,
      })
    }

    return after
  },

  async rescheduleIntervention(id, newStart, newEnd, reason, actor = {}) {
    const before = await this.getIntervention(id)
    if (!before) throw new Error('Intervento non trovato')

    const updates = {
      scheduled_start_at: newStart instanceof Date ? newStart.toISOString() : newStart,
      scheduled_end_at: newEnd instanceof Date ? newEnd.toISOString() : (newEnd || null),
    }
    const after = await this.updateIntervention(id, updates)

    await logActivity({
      intervention_id: id,
      report_id: after.report_id,
      type: 'intervention_rescheduled',
      from_status: before.scheduled_start_at || null,
      to_status: after.scheduled_start_at || null,
      detail: reason || null,
      user_id: actor.user_id || null,
      user_name: actor.user_name || null,
      org_id: after.org_id,
    })

    if (after.assigned_to) {
      await notifyAssignee({
        intervention_id: id,
        target_user: after.assigned_to,
        from_user: actor.user_id || null,
        type: 'intervention_rescheduled',
        title: 'Intervento riprogrammato',
        body: after.title,
        org_id: after.org_id,
      })
    }

    return after
  },

  async startIntervention(id, actor = {}) {
    const after = await this.updateIntervention(id, {
      status: 'in_corso',
      actual_start_at: new Date().toISOString(),
      updated_by_user_id: actor.user_id,
      updated_by_user_name: actor.user_name,
    })
    return after
  },

  async completeIntervention(id, { notes, media } = {}, actor = {}) {
    const updates = {
      status: 'completato',
      actual_end_at: new Date().toISOString(),
      updated_by_user_id: actor.user_id,
      updated_by_user_name: actor.user_name,
    }
    if (notes) updates.planning_notes = notes
    if (media) updates.media = media
    return this.updateIntervention(id, updates)
  },

  async cancelIntervention(id, reason, actor = {}) {
    const after = await this.updateIntervention(id, {
      status: 'annullato',
      planning_notes: reason || null,
      updated_by_user_id: actor.user_id,
      updated_by_user_name: actor.user_name,
    })
    // Notifica l'assegnatario dell'annullamento
    if (after.assigned_to) {
      await notifyAssignee({
        intervention_id: id,
        target_user: after.assigned_to,
        from_user: actor.user_id || null,
        type: 'intervention_cancelled',
        title: 'Intervento annullato',
        body: after.title,
        org_id: after.org_id,
      })
    }
    return after
  },

  async deleteIntervention(id) {
    if (supabase) {
      const { error } = await supabase.from('interventions').delete().eq('id', id)
      if (error) throw error
      return
    }
    const list = getStore(KEYS.interventions).filter(i => i.id !== id)
    setStore(KEYS.interventions, list)
  },

  // Sollecito conferma fornitore: aggiorna planning_notes con timestamp.
  // Il magic link vero arriva in Sprint 2. Per ora è un'azione tracciata.
  async sendSupplierReminder(id, actor = {}) {
    const before = await this.getIntervention(id)
    if (!before) throw new Error('Intervento non trovato')
    const reminderMark = `[Sollecito ${new Date().toLocaleString('it-IT')}]`
    const newNotes = before.planning_notes
      ? `${before.planning_notes}\n${reminderMark}`
      : reminderMark
    const after = await this.updateIntervention(id, {
      planning_notes: newNotes,
      updated_by_user_id: actor.user_id,
      updated_by_user_name: actor.user_name,
    })
    await logActivity({
      intervention_id: id,
      report_id: after.report_id,
      type: 'intervention_supplier_reminded',
      detail: reminderMark,
      user_id: actor.user_id || null,
      user_name: actor.user_name || null,
      org_id: after.org_id,
    })
    return after
  },
}

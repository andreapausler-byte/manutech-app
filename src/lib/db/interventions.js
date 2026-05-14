import { supabase, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

// ─── Helpers interni ───────────────────────────────────────────────────

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

// Costruisce il payload INSERT per la tabella interventions a partire dai
// dati del form/shell. Centralizzato per uso da createInterventionWithReports
// e shim createIntervention.
function buildInterventionPayload(data, orgId) {
  return {
    type: data.type || 'correttiva',
    severity: data.severity || 'media',
    status: data.status || (data.scheduled_start_at ? 'pianificato' : 'bozza'),
    title: data.title,
    description: data.description || '',
    machine_id: data.machine_id || null,
    machine_name: data.machine_name || null,
    maintenance_plan_id: data.maintenance_plan_id || null,
    origin: data.origin || (data.maintenance_plan_id ? 'maintenance_plan' : 'manuale'),
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
}

// Inserisce un singolo link intervention_reports. Used da createInterventionWithReports
// e linkReportToIntervention. Demo path coerente.
async function insertLinkRow({ intervention_id, report_id, is_origin, resolves_report, added_by, added_by_name, org_id }) {
  const link = {
    intervention_id,
    report_id,
    is_origin: !!is_origin,
    resolves_report: resolves_report ?? true,
    added_by: added_by || null,
    added_by_name: added_by_name || null,
    org_id,
  }
  if (supabase) {
    const { error } = await supabase.from('intervention_reports').insert(link)
    if (error) throw error
    return link
  }
  const list = getStore(KEYS.interventionReports)
  list.push({ ...link, added_at: new Date().toISOString() })
  setStore(KEYS.interventionReports, list)
  return link
}

// ─── Modulo principale ─────────────────────────────────────────────────

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
      if (filters.maintenance_plan_id) query = query.eq('maintenance_plan_id', filters.maintenance_plan_id)
      if (filters.machine_id) query = query.eq('machine_id', filters.machine_id)
      // NOTE filters.report_id NON più supportato qui (post-mig 055): usa
      // getInterventionsForReport() che fa JOIN su intervention_reports.
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

  // Restituisce gli interventi associati a un report tramite la table
  // intervention_reports (post-mig 055 N→M). L'array contiene gli interventi
  // arricchiti con metadata del link: link_is_origin, link_resolves_report,
  // link_added_at.
  async getInterventionsForReport(reportId) {
    if (!reportId) return []
    if (supabase) {
      // Fetch link rows + JOIN su interventions
      const { data, error } = await supabase
        .from('intervention_reports')
        .select('is_origin, resolves_report, added_at, intervention:interventions(*)')
        .eq('report_id', reportId)
      if (error) {
        console.warn('[interventions] getInterventionsForReport:', error.message)
        return []
      }
      return (data || [])
        .filter(row => !!row.intervention)
        .map(row => ({
          ...row.intervention,
          link_is_origin: row.is_origin,
          link_resolves_report: row.resolves_report,
          link_added_at: row.added_at,
        }))
        .sort((a, b) => {
          const da = a.scheduled_start_at ? new Date(a.scheduled_start_at).getTime() : Infinity
          const db = b.scheduled_start_at ? new Date(b.scheduled_start_at).getTime() : Infinity
          return da - db
        })
    }
    const links = getStore(KEYS.interventionReports).filter(l => l.report_id === reportId)
    const allInterventions = getStore(KEYS.interventions)
    return links
      .map(l => {
        const intv = allInterventions.find(i => i.id === l.intervention_id)
        if (!intv) return null
        return {
          ...intv,
          link_is_origin: l.is_origin,
          link_resolves_report: l.resolves_report,
          link_added_at: l.added_at,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const da = a.scheduled_start_at ? new Date(a.scheduled_start_at).getTime() : Infinity
        const db = b.scheduled_start_at ? new Date(b.scheduled_start_at).getTime() : Infinity
        return da - db
      })
  },

  // Restituisce i report associati a un intervento. Ogni elemento è il
  // report arricchito con link_is_origin / link_resolves_report / link_added_at.
  async getReportsForIntervention(interventionId) {
    if (!interventionId) return []
    if (supabase) {
      const { data, error } = await supabase
        .from('intervention_reports')
        .select('is_origin, resolves_report, added_at, added_by, added_by_name, report:reports(*)')
        .eq('intervention_id', interventionId)
      if (error) {
        console.warn('[interventions] getReportsForIntervention:', error.message)
        return []
      }
      return (data || [])
        .filter(row => !!row.report)
        .map(row => ({
          ...row.report,
          link_is_origin: row.is_origin,
          link_resolves_report: row.resolves_report,
          link_added_at: row.added_at,
          link_added_by: row.added_by,
          link_added_by_name: row.added_by_name,
        }))
        .sort((a, b) => (b.link_is_origin ? 1 : 0) - (a.link_is_origin ? 1 : 0))
    }
    const links = getStore(KEYS.interventionReports).filter(l => l.intervention_id === interventionId)
    const allReports = getStore(KEYS.reports)
    return links
      .map(l => {
        const r = allReports.find(x => x.id === l.report_id)
        if (!r) return null
        return {
          ...r,
          link_is_origin: l.is_origin,
          link_resolves_report: l.resolves_report,
          link_added_at: l.added_at,
          link_added_by: l.added_by,
          link_added_by_name: l.added_by_name,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.link_is_origin ? 1 : 0) - (a.link_is_origin ? 1 : 0))
  },

  async getInterventionsForSupplier(userId) {
    if (!userId) return []
    return this.getInterventions({ assigned_to: userId })
  },

  // Per ogni reportId della lista, ritorna i link a interventi ATTIVI
  // (status pianificato/confermato/in_corso). Usato da ReportMultiPicker
  // per il warning "⚠ già linkato a INT-XXX".
  // Ritorna { [reportId]: [{ intervention_id, intervention_title, intervention_status }] }.
  async getActiveLinksByReports(reportIds) {
    if (!reportIds?.length) return {}
    const ACTIVE_STATUSES = ['pianificato', 'confermato', 'in_corso']
    if (supabase) {
      const { data, error } = await supabase
        .from('intervention_reports')
        .select('report_id, intervention:interventions(id, title, status)')
        .in('report_id', reportIds)
      if (error) {
        console.warn('[interventions] getActiveLinksByReports:', error.message)
        return {}
      }
      const map = {}
      for (const row of (data || [])) {
        const intv = row.intervention
        if (!intv || !ACTIVE_STATUSES.includes(intv.status)) continue
        if (!map[row.report_id]) map[row.report_id] = []
        map[row.report_id].push({
          intervention_id: intv.id,
          intervention_title: intv.title,
          intervention_status: intv.status,
        })
      }
      return map
    }
    // Demo
    const links = getStore(KEYS.interventionReports).filter(l => reportIds.includes(l.report_id))
    const allIntv = getStore(KEYS.interventions)
    const map = {}
    for (const l of links) {
      const intv = allIntv.find(i => i.id === l.intervention_id)
      if (!intv || !ACTIVE_STATUSES.includes(intv.status)) continue
      if (!map[l.report_id]) map[l.report_id] = []
      map[l.report_id].push({
        intervention_id: intv.id,
        intervention_title: intv.title,
        intervention_status: intv.status,
      })
    }
    return map
  },

  // Lookup planning_state aggregato per una lista di report. Usato dal badge
  // della lista admin segnalazioni. Legge la view reports_with_planning quando
  // Supabase è configurato; in demo mode lo calcola in-memory.
  async getPlanningStateForReports(reportIds) {
    if (!reportIds?.length) return {}
    if (supabase) {
      const { data, error } = await supabase
        .from('reports_with_planning')
        .select('id, planning_state, active_interventions_count, next_intervention_at, linked_interventions_count')
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
          linked_count: row.linked_interventions_count,
        }
      }
      return map
    }
    // Demo: ricalcola da intervention_reports + interventions in localStorage
    const allLinks = getStore(KEYS.interventionReports)
    const allIntv = getStore(KEYS.interventions)
    const allReports = getStore(KEYS.reports)
    const map = {}
    for (const id of reportIds) {
      const r = allReports.find(rep => rep.id === id)
      const reportLinks = allLinks.filter(l => l.report_id === id)
      const linkedCount = reportLinks.length
      const resolvingLinks = reportLinks.filter(l => l.resolves_report)
      const resolvingIntv = resolvingLinks
        .map(l => allIntv.find(i => i.id === l.intervention_id))
        .filter(Boolean)
      const active = resolvingIntv.filter(i => !['annullato', 'completato'].includes(i.status))
      let state = 'altro'
      if (active.length === 0 && r?.status === 'aperta') state = 'da_pianificare'
      else if (active.some(i => i.status === 'in_corso')) state = 'in_corso'
      else if (active.some(i => ['pianificato', 'confermato'].includes(i.status))) state = 'pianificato'
      else if (r?.status === 'risolta') state = 'risolta'
      const nextAt = active
        .map(i => i.scheduled_start_at)
        .filter(Boolean)
        .sort()[0] || null
      map[id] = {
        planning_state: state,
        active_count: active.length,
        next_at: nextAt,
        linked_count: linkedCount,
      }
    }
    return map
  },

  // Contatore "interventi attivi" per utente assegnatario (immutato).
  async getActiveInterventionsCountByUser() {
    if (supabase) {
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

  async getUserPickerCounters({ machineId } = {}) {
    const [active, completedOnMachine] = await Promise.all([
      this.getActiveInterventionsCountByUser(),
      machineId ? this.getCompletedInterventionsCountByUserMachine(machineId) : Promise.resolve({}),
    ])
    return { active, completedOnMachine }
  },

  // ─── WRITE ──────────────────────────────────────────────────────────

  // API PRINCIPALE post-mig 055: crea intervento + N link a report in modo
  // (semi-)atomico. Se uno dei link fallisce, l'intervento è già creato — la
  // shell deve gestire eventuali rollback manuali se necessario.
  //
  // data:  payload intervention (NO report_id, gestito via links)
  // links: array { report_id, is_origin?, resolves_report? }
  //   - is_origin default: il primo link is_origin=true se nessuno è esplicito
  //   - resolves_report default: true
  //   - max 1 link is_origin=true (vincolato anche da unique partial index)
  //
  // Ritorna l'intervento creato.
  async createInterventionWithReports(data, links = []) {
    const orgId = data.org_id || (supabase ? await getMyOrgId() : 'demo-org')
    const payload = buildInterventionPayload(data, orgId)
    // Auto-deriva origin se non specificato e ci sono link
    if (!data.origin && links.length > 0) {
      payload.origin = 'report'
    }

    // Normalizza links: max 1 is_origin, default primo
    let normalizedLinks = (links || []).map(l => ({
      report_id: l.report_id,
      is_origin: !!l.is_origin,
      resolves_report: l.resolves_report ?? true,
    }))
    const explicitOrigins = normalizedLinks.filter(l => l.is_origin).length
    if (explicitOrigins === 0 && normalizedLinks.length > 0) {
      normalizedLinks[0].is_origin = true
    } else if (explicitOrigins > 1) {
      throw new Error('createInterventionWithReports: solo un link può avere is_origin=true')
    }

    // 1. INSERT intervention
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

    // 2. INSERT links
    const originReportId = normalizedLinks.find(l => l.is_origin)?.report_id || null
    for (const link of normalizedLinks) {
      try {
        await insertLinkRow({
          intervention_id: inserted.id,
          report_id: link.report_id,
          is_origin: link.is_origin,
          resolves_report: link.resolves_report,
          added_by: data.created_by || null,
          added_by_name: data.created_by_name || null,
          org_id: orgId,
        })
      } catch (e) {
        console.warn('[interventions] link insert failed (continuing):', e?.message)
      }
    }

    // 3. Activity log "intervention_created" (con report_id = origin singolo)
    await logActivity({
      intervention_id: inserted.id,
      report_id: originReportId,
      type: 'intervention_created',
      to_status: inserted.status,
      detail: inserted.title,
      user_id: inserted.created_by,
      user_name: inserted.created_by_name,
      org_id: orgId,
    })

    // 4. Notifica all'assegnatario
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

  // SHIM legacy: accetta `data.report_id` e converte in chiamata
  // createInterventionWithReports([{report_id, is_origin:true, resolves_report:true}]).
  // Logga warning console + scrive activity row type='deprecated_api_call'
  // per audit server-side (query SQL post-deploy per identificare callsite
  // residui:
  //   SELECT created_at, user_name, detail FROM activities
  //   WHERE type='deprecated_api_call' ORDER BY created_at DESC;
  // ).
  //
  // Error handling audit (Sprint 1c review punto #1, opzione c):
  // se la scrittura dell'activity audit fallisce (RLS, network, schema
  // mismatch), il fallimento NON blocca la chiamata di creazione: log
  // perso visibilmente via console.error + swallow. La creazione legacy
  // procede comunque. Motivazione: l'audit shim è "best effort", la
  // priorità è non rompere la chiamata.
  async createIntervention(data) {
    if (data?.report_id) {
      const callerLine = new Error().stack?.split('\n')[2]?.trim() || 'unknown'
      console.warn(
        '[interventions] createIntervention(data) con report_id è deprecata. ' +
        'Usa createInterventionWithReports(data, [{report_id, is_origin:true}]). ' +
        'Caller stack:', callerLine
      )
      // Server-side audit (fire-and-forget, console.error + swallow su errore).
      // Scriviamo inline (non via logActivity helper) per gestire l'errore
      // esplicitamente con console.error invece dell'internal console.warn.
      const orgId = data.org_id || (supabase ? await getMyOrgId() : 'demo-org')
      const auditRow = {
        type: 'deprecated_api_call',
        report_id: data.report_id,
        detail: `db.createIntervention(data) shim invocato. Caller: ${callerLine}. Payload contiene report_id=${data.report_id}`,
        user_id: data.created_by || null,
        user_name: data.created_by_name || 'unknown',
        org_id: orgId,
      }
      try {
        if (supabase) {
          const { error } = await supabase.from('activities').insert(auditRow)
          if (error) {
            console.error('[shim audit] INSERT activities deprecated_api_call failed:', error)
          }
        } else {
          const list = getStore(KEYS.activities)
          list.unshift({
            ...auditRow,
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            created_at: new Date().toISOString(),
          })
          setStore(KEYS.activities, list)
        }
      } catch (e) {
        // Eccezione imprevista (network, parsing, ecc.): swallow + console.error.
        // L'audit log è perso, la creazione legacy continua comunque.
        console.error('[shim audit] log failed (continuing with create):', e)
      }

      const { report_id, ...rest } = data
      return this.createInterventionWithReports(
        { ...rest, origin: rest.origin || 'report' },
        [{ report_id, is_origin: true, resolves_report: true }]
      )
    }
    return this.createInterventionWithReports(data, [])
  },

  // Aggiunge un link report ↔ intervento esistente (post-creazione).
  // Activity log type='report_linked_to_intervention'.
  async linkReportToIntervention({ interventionId, reportId, isOrigin = false, resolvesReport = true, actor = {} }) {
    if (!interventionId || !reportId) throw new Error('linkReportToIntervention: interventionId e reportId obbligatori')
    const intervention = await this.getIntervention(interventionId)
    if (!intervention) throw new Error('Intervento non trovato')
    const orgId = intervention.org_id

    await insertLinkRow({
      intervention_id: interventionId,
      report_id: reportId,
      is_origin: isOrigin,
      resolves_report: resolvesReport,
      added_by: actor.user_id || null,
      added_by_name: actor.user_name || null,
      org_id: orgId,
    })

    await logActivity({
      intervention_id: interventionId,
      report_id: reportId,
      type: 'report_linked_to_intervention',
      detail: `Segnalazione linkata${resolvesReport ? '' : ' (contesto, no auto-close)'}`,
      user_id: actor.user_id || null,
      user_name: actor.user_name || null,
      org_id: orgId,
    })
  },

  // Rimuove un link. Activity log type='report_unlinked_from_intervention'.
  async unlinkReportFromIntervention(interventionId, reportId, actor = {}) {
    if (!interventionId || !reportId) return
    const intervention = await this.getIntervention(interventionId)
    if (!intervention) return
    const orgId = intervention.org_id

    if (supabase) {
      const { error } = await supabase
        .from('intervention_reports')
        .delete()
        .eq('intervention_id', interventionId)
        .eq('report_id', reportId)
      if (error) throw error
    } else {
      const list = getStore(KEYS.interventionReports)
        .filter(l => !(l.intervention_id === interventionId && l.report_id === reportId))
      setStore(KEYS.interventionReports, list)
    }

    await logActivity({
      intervention_id: interventionId,
      report_id: reportId,
      type: 'report_unlinked_from_intervention',
      detail: 'Segnalazione scollegata dall\'intervento',
      user_id: actor.user_id || null,
      user_name: actor.user_name || null,
      org_id: orgId,
    })
  },

  // Aggiorna il flag resolves_report di un link esistente.
  async setResolvesReport(interventionId, reportId, resolvesReport) {
    if (supabase) {
      const { error } = await supabase
        .from('intervention_reports')
        .update({ resolves_report: !!resolvesReport })
        .eq('intervention_id', interventionId)
        .eq('report_id', reportId)
      if (error) throw error
      return
    }
    const list = getStore(KEYS.interventionReports)
    const idx = list.findIndex(l => l.intervention_id === interventionId && l.report_id === reportId)
    if (idx === -1) return
    list[idx].resolves_report = !!resolvesReport
    setStore(KEYS.interventionReports, list)
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
    // Demo: pulisci anche i link orfani
    const links = getStore(KEYS.interventionReports).filter(l => l.intervention_id !== id)
    setStore(KEYS.interventionReports, links)
  },

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
      type: 'intervention_supplier_reminded',
      detail: reminderMark,
      user_id: actor.user_id || null,
      user_name: actor.user_name || null,
      org_id: after.org_id,
    })
    return after
  },
}

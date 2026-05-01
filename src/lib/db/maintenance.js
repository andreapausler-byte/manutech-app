import { supabase, supabaseUrl, supabaseAnonKey, getMyOrgId } from './_client'

export const maintenance = {
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

  // Piani con macchina inclusa (evita join client-side)
  async getAllMaintenancePlansWithMachine() {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_plans')
        .select('*, machine:machines(id, name, department)')
        .order('name')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Ultimo log per ogni piano
  async getLastLogPerPlan() {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_logs')
        .select('*')
        .not('plan_id', 'is', null)
        .order('performed_at', { ascending: false })
      if (error) throw error
      const lastByPlan = {}
      for (const log of (data || [])) {
        if (!lastByPlan[log.plan_id]) lastByPlan[log.plan_id] = log
      }
      return lastByPlan
    }
    return {}
  },

  async getMaintenanceLogsPaginated(limit = 50, offset = 0) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_logs')
        .select('*, machine:machines(id, name), component:machine_components(id, name)')
        .order('performed_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (error) throw error
      return data || []
    }
    return []
  },

  async createMaintenancePlan(plan) {
    if (supabase) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_maintenance_plan', {
        _machine_id: plan.machine_id,
        _name: plan.name,
        _frequency_days: plan.frequency_days || 30,
        _assigned_to: plan.assigned_to || null,
        _assigned_to_name: plan.assigned_to_name || null,
        _instructions: plan.instructions || null,
      })
      if (!rpcError && rpcData) return rpcData
      if (rpcError) console.warn('[ManuTech] RPC create_maintenance_plan non disponibile, fallback insert diretto:', rpcError.message)
      const insertData = { ...plan }
      insertData.org_id = await getMyOrgId()
      const { data, error } = await supabase.from('maintenance_plans').insert(insertData).select().single()
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
      const orgId = await getMyOrgId()
      const rows = plans.map(p => ({ ...p, org_id: p.org_id || orgId }))
      const { data, error } = await supabase.from('maintenance_plans').insert(rows).select()
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
      const rpcParams = {
        _machine_id: log.machine_id,
        _title: log.title,
        _plan_id: log.plan_id || null,
        _report_id: log.report_id || null,
        _component_id: log.component_id || null,
        _type: log.type || 'programmata',
        _description: log.description || null,
        _performed_by_name: log.performed_by_name || null,
        _duration_minutes: log.duration_minutes || null,
        _parts_replaced: log.parts_replaced || null,
        _performed_at: log.performed_at || new Date().toISOString(),
        _is_external: !!log.is_external,
        _contractor_name: log.contractor_name || null,
        _contractor_reference: log.contractor_reference || null,
        _media: Array.isArray(log.media) ? log.media : [],
      }
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_maintenance_log', rpcParams)
      if (!rpcError && rpcData) return rpcData
      if (rpcError) console.warn('[ManuTech] RPC create_maintenance_log non disponibile, fallback insert diretto:', rpcError.message)
      let insertData = { ...log }
      if (!insertData.org_id) {
        insertData.org_id = await getMyOrgId()
      }
      const { data, error } = await supabase.from('maintenance_logs').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    return { ...log, id: `ml-${Date.now()}`, created_at: new Date().toISOString() }
  },

  // Riavvia l'indicizzazione knowledge-base via edge function `ingest-knowledge`.
  // In demo mode ritorna { ok: false, demo: true } senza throw.
  async queueMachineReindex(machineId) {
    if (!supabase || !machineId) return { ok: false, demo: true }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        return { ok: false, error: 'Sessione scaduta — rieffettua il login' }
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/ingest-knowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ machine_id: machineId }),
      })

      let body = null
      let rawText = null
      try { rawText = await res.text() } catch { /* no body */ }
      if (rawText) {
        try { body = JSON.parse(rawText) } catch { body = null }
      }

      if (!res.ok) {
        const detail = body?.error || rawText || `HTTP ${res.status}`
        const msg = `[${res.status}] ${detail}`
        console.warn('[ManuTech] ingest-knowledge error:', msg)
        return { ok: false, error: msg, status: res.status }
      }
      if (body?.ok) {
        console.info('[ManuTech] knowledge base aggiornata:', body)
        return { ok: true, chunks: body.chunks ?? 0, ...body }
      }
      return { ok: false, error: body?.error || 'unknown error' }
    } catch (err) {
      console.warn('[ManuTech] queueMachineReindex throw:', err)
      return { ok: false, error: err.message || 'network error' }
    }
  },

  async getKnowledgeStats(machineId) {
    if (!supabase || !machineId) {
      return { chunks: 0, sources: 0, last_indexed_at: null }
    }
    try {
      const { data, error } = await supabase.rpc('get_knowledge_stats', { p_machine_id: machineId })
      if (error) {
        console.warn('[ManuTech] getKnowledgeStats error:', error.message)
        return { chunks: 0, sources: 0, last_indexed_at: null }
      }
      return data || { chunks: 0, sources: 0, last_indexed_at: null }
    } catch (err) {
      console.warn('[ManuTech] getKnowledgeStats throw:', err)
      return { chunks: 0, sources: 0, last_indexed_at: null }
    }
  },

  async updateMaintenanceLog(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('maintenance_logs')
        .update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    return { id, ...updates }
  },

  async deleteMaintenanceLog(id) {
    if (supabase) {
      const { error } = await supabase.from('maintenance_logs').delete().eq('id', id)
      if (error) throw error
    }
  },
}

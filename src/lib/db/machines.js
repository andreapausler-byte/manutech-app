import { supabase, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

// Demo mode: quello che in Supabase fanno i trigger della migration 062 —
// tenere allineate le etichette `component_name` sugli allegati quando un
// componente viene rinominato, e toglierle quando viene cancellato. I file
// restano sulla macchina in entrambi i casi.
function retagDemoAttachments(componentId, name) {
  const list = getStore(KEYS.machines)
  let touched = false
  const next = list.map(m => {
    if (!Array.isArray(m.attachments)) return m
    let changed = false
    const attachments = m.attachments.map(a => {
      if (a.component_id !== componentId) return a
      changed = true
      if (name) return { ...a, component_name: name }
      const { component_id, component_name, ...rest } = a  // eslint-disable-line no-unused-vars
      return rest
    })
    if (!changed) return m
    touched = true
    return { ...m, attachments }
  })
  if (touched) setStore(KEYS.machines, next)
}

export const machines = {
  async getMachines() {
    if (supabase) {
      const { data, error } = await supabase.from('machines').select('*').order('sort_order', { ascending: true }).order('name')
      if (error) throw error
      return data || []
    }
    const list = getStore(KEYS.machines)
    return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  },

  // Rilegge una singola macchina. Serve dove il server può aver cambiato la
  // riga senza passare dal client: i trigger della 062 riscrivono
  // `attachments` quando un componente viene rinominato o cancellato.
  async getMachine(id) {
    if (supabase) {
      const { data, error } = await supabase.from('machines').select('*').eq('id', id).single()
      if (error) throw error
      return data
    }
    return getStore(KEYS.machines).find(m => m.id === id) || null
  },

  async createMachine(machine) {
    if (supabase) {
      const { data, error } = await supabase.from('machines').insert(machine).select().single()
      if (error) throw error
      return data
    }
    const list = getStore(KEYS.machines)
    const newMachine = { ...machine, id: `mac-${Date.now()}`, created_at: new Date().toISOString() }
    list.push(newMachine)
    setStore(KEYS.machines, list)
    return newMachine
  },

  async updateMachine(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('machines').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const list = getStore(KEYS.machines)
    const idx = list.findIndex(m => m.id === id)
    if (idx === -1) throw new Error('Macchinario non trovato')
    list[idx] = { ...list[idx], ...updates }
    setStore(KEYS.machines, list)
    return list[idx]
  },

  async deleteMachine(id) {
    if (supabase) {
      const { error } = await supabase.from('machines').delete().eq('id', id)
      if (error) throw error
      return
    }
    const list = getStore(KEYS.machines).filter(m => m.id !== id)
    setStore(KEYS.machines, list)
  },

  // Aggiorna l'ordine di tutti i macchinari (drag & drop catena)
  async reorderMachines(orderedIds) {
    if (supabase) {
      const results = await Promise.all(
        orderedIds.map((id, i) =>
          supabase.from('machines').update({ sort_order: i + 1 }).eq('id', id)
        )
      )
      const failed = results.find(r => r.error)
      if (failed) throw failed.error
      return
    }
    const list = getStore(KEYS.machines)
    orderedIds.forEach((id, i) => {
      const m = list.find(m => m.id === id)
      if (m) m.sort_order = i + 1
    })
    setStore(KEYS.machines, list)
  },

  // ─── AREAS ───
  async getAreas() {
    if (supabase) {
      const { data, error } = await supabase.from('areas')
        .select('*').order('sort_order').order('name')
      if (error) throw error
      return data || []
    }
    return getStore('manutech_areas').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  },

  async createArea(area) {
    if (supabase) {
      const insertData = { ...area, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('areas').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_areas')
    const newItem = { ...area, id: `area-${Date.now()}`, created_at: new Date().toISOString() }
    items.push(newItem)
    setStore('manutech_areas', items)
    return newItem
  },

  async updateArea(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('areas')
        .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_areas')
    const idx = items.findIndex(a => a.id === id)
    if (idx === -1) throw new Error('Area non trovata')
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
    setStore('manutech_areas', items)
    return items[idx]
  },

  async deleteArea(id) {
    if (supabase) {
      const { error } = await supabase.from('areas').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_areas').filter(a => a.id !== id)
    setStore('manutech_areas', items)
  },

  // ─── MACHINE COMPONENTS ───
  async getMachineComponents(machineId) {
    if (supabase) {
      const { data, error } = await supabase.from('machine_components')
        .select('*').eq('machine_id', machineId).order('sort_order').order('name')
      if (error) throw error
      return data || []
    }
    return getStore('manutech_components').filter(c => c.machine_id === machineId)
  },

  async createMachineComponent(component) {
    if (supabase) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_machine_component', {
        _machine_id: component.machine_id,
        _name: component.name,
        _type: component.type || null,
        _serial_number: component.serial_number || null,
        _manufacturer: component.manufacturer || null,
        _model: component.model || null,
        _year: component.year || null,
        _notes: component.notes || null,
      })
      if (!rpcError && rpcData) return rpcData
      if (rpcError) console.warn('[ManuTech] RPC fallback:', rpcError.message)
      const insertData = { ...component, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('machine_components').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_components')
    const newItem = { ...component, id: `comp-${Date.now()}`, created_at: new Date().toISOString() }
    items.push(newItem)
    setStore('manutech_components', items)
    return newItem
  },

  async updateMachineComponent(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('machine_components')
        .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_components')
    const idx = items.findIndex(c => c.id === id)
    if (idx === -1) throw new Error('Componente non trovato')
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
    setStore('manutech_components', items)
    if (updates.name) retagDemoAttachments(id, updates.name)
    return items[idx]
  },

  async deleteMachineComponent(id) {
    if (supabase) {
      // I file archiviati sotto il componente non spariscono con lui: un
      // trigger (migration 062) toglie l'etichetta e li lascia alla macchina.
      const { error } = await supabase.from('machine_components').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_components').filter(c => c.id !== id)
    setStore('manutech_components', items)
    retagDemoAttachments(id, null)
  },
}

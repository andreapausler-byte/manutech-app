import { supabase, getMyOrgId } from './_client'
import { getStore, setStore } from './_demoStore'

export const spareParts = {
  async getSpareParts() {
    if (supabase) {
      const { data, error } = await supabase.from('spare_parts')
        .select('*').order('name')
      if (error) throw error
      return data || []
    }
    return getStore('manutech_spare_parts')
  },

  async createSparePart(part) {
    if (supabase) {
      const insertData = { ...part, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('spare_parts').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_parts')
    const newItem = { ...part, id: `sp-${Date.now()}`, created_at: new Date().toISOString() }
    items.push(newItem)
    setStore('manutech_spare_parts', items)
    return newItem
  },

  async updateSparePart(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('spare_parts')
        .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_parts')
    const idx = items.findIndex(s => s.id === id)
    if (idx === -1) throw new Error('Ricambio non trovato')
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
    setStore('manutech_spare_parts', items)
    return items[idx]
  },

  async deleteSparePart(id) {
    if (supabase) {
      const { error } = await supabase.from('spare_parts').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_spare_parts').filter(s => s.id !== id)
    setStore('manutech_spare_parts', items)
  },

  // ─── SPARE PART ORDERS ───
  async getSparePartOrders(filters = {}) {
    if (supabase) {
      let query = supabase.from('spare_part_orders').select('*').order('created_at', { ascending: false })
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.report_id) query = query.eq('report_id', filters.report_id)
      const { data, error } = await query
      if (error) throw error
      return data || []
    }
    let items = getStore('manutech_spare_orders')
    if (filters.status) items = items.filter(o => o.status === filters.status)
    if (filters.report_id) items = items.filter(o => o.report_id === filters.report_id)
    return items
  },

  async createSparePartOrder(order) {
    if (supabase) {
      const insertData = { ...order, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('spare_part_orders').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_orders')
    const newItem = { ...order, id: `spo-${Date.now()}`, created_at: new Date().toISOString(), ordered_at: new Date().toISOString() }
    items.push(newItem)
    setStore('manutech_spare_orders', items)
    return newItem
  },

  async updateSparePartOrder(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('spare_part_orders')
        .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_orders')
    const idx = items.findIndex(o => o.id === id)
    if (idx === -1) throw new Error('Ordine non trovato')
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
    setStore('manutech_spare_orders', items)
    return items[idx]
  },

  async receiveSparePartOrder(orderId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('receive_spare_part_order', { _order_id: orderId })
      if (error) throw error
      return data
    }
    const orders = getStore('manutech_spare_orders')
    const idx = orders.findIndex(o => o.id === orderId)
    if (idx === -1) throw new Error('Ordine non trovato')
    orders[idx] = { ...orders[idx], status: 'ricevuto', received_at: new Date().toISOString() }
    setStore('manutech_spare_orders', orders)
    if (orders[idx].spare_part_id) {
      const parts = getStore('manutech_spare_parts')
      const pi = parts.findIndex(p => p.id === orders[idx].spare_part_id)
      if (pi >= 0) { parts[pi].stock_qty = (parts[pi].stock_qty || 0) + orders[idx].quantity; setStore('manutech_spare_parts', parts) }
    }
    return orders[idx]
  },

  async deleteSparePartOrder(id) {
    if (supabase) {
      const { error } = await supabase.from('spare_part_orders').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_spare_orders').filter(o => o.id !== id)
    setStore('manutech_spare_orders', items)
  },

  // ─── COMPATIBILITY ───
  async getSparePartCompatibility(sparePartId) {
    if (supabase) {
      const { data, error } = await supabase.from('spare_part_compatibility')
        .select('*, machine:machines(id, name), component:machine_components(id, name)')
        .eq('spare_part_id', sparePartId)
      if (error) throw error
      return data || []
    }
    return getStore('manutech_spare_compat').filter(c => c.spare_part_id === sparePartId)
  },

  async getCompatibleSpareParts(machineId, componentId = null) {
    if (supabase) {
      let query = supabase.from('spare_part_compatibility')
        .select('*, spare_part:spare_parts(*)')
        .eq('machine_id', machineId)
      if (componentId) query = query.eq('component_id', componentId)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map(d => d.spare_part).filter(Boolean)
    }
    const compat = getStore('manutech_spare_compat').filter(c =>
      c.machine_id === machineId && (!componentId || c.component_id === componentId)
    )
    const parts = getStore('manutech_spare_parts')
    return compat.map(c => parts.find(p => p.id === c.spare_part_id)).filter(Boolean)
  },

  async addSparePartCompatibility(sparePartId, machineId, componentId = null) {
    if (supabase) {
      const insertData = { spare_part_id: sparePartId, machine_id: machineId, component_id: componentId, org_id: await getMyOrgId() }
      const { data, error } = await supabase.from('spare_part_compatibility').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const items = getStore('manutech_spare_compat')
    const newItem = { id: `spc-${Date.now()}`, spare_part_id: sparePartId, machine_id: machineId, component_id: componentId }
    items.push(newItem)
    setStore('manutech_spare_compat', items)
    return newItem
  },

  async removeSparePartCompatibility(id) {
    if (supabase) {
      const { error } = await supabase.from('spare_part_compatibility').delete().eq('id', id)
      if (error) throw error
      return
    }
    const items = getStore('manutech_spare_compat').filter(c => c.id !== id)
    setStore('manutech_spare_compat', items)
  },
}

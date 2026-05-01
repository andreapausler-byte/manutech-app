import { supabase, getMyOrgId } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

export const activities = {
  // Traccia ogni evento: creazione, cambio stato, commento, media
  async addActivity(reportId, activity) {
    if (supabase) {
      let insertData = { ...activity, report_id: reportId }
      if (!insertData.org_id) insertData.org_id = await getMyOrgId()
      const { data, error } = await supabase.from('activities').insert(insertData).select().single()
      if (error) throw error
      return data
    }
    const list = getStore(KEYS.activities)
    const newActivity = {
      ...activity,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      report_id: reportId,
      created_at: new Date().toISOString(),
    }
    list.unshift(newActivity)
    setStore(KEYS.activities, list)
    return newActivity
  },

  async getActivities(reportId) {
    if (supabase) {
      const { data, error } = await supabase.from('activities').select('*').eq('report_id', reportId).order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    }
    return getStore(KEYS.activities).filter(a => a.report_id === reportId)
  },

  async getAllActivities(limit = 50) {
    if (supabase) {
      const { data, error } = await supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return data || []
    }
    return getStore(KEYS.activities).slice(0, limit)
  },
}

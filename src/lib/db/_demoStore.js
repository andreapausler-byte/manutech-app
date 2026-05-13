import { DEMO_ORG_ID } from './_client'

export const KEYS = {
  users: 'manutech_users',
  reports: 'manutech_reports',
  machines: 'manutech_machines',
  session: 'manutech_session',
  comments: 'manutech_comments',
  activities: 'manutech_activities',
  notifications: 'manutech_notifications',
  reportStars: 'manutech_report_stars',
  interventions: 'manutech_interventions',
}

export function getStore(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') }
  catch (e) { console.warn(`[ManuTech] Dati corrotti in localStorage (${key}):`, e.message); return [] }
}

export function setStore(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function demoToken() {
  return 'demo_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Inizializza lo store demo con utenti retrofittati (status + org_id default).
export function ensureDefaultAdmin() {
  const users = getStore(KEYS.users)
  let changed = false
  for (const u of users) {
    if (!u.status) { u.status = 'active'; changed = true }
    if (!u.org_id) { u.org_id = DEMO_ORG_ID; changed = true }
  }
  if (changed) setStore(KEYS.users, users)
}

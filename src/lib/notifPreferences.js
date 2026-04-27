/**
 * notifPreferences.js — Sprint 3.7 → v5.4 Web Push
 *
 * Gestisce le preferenze notifiche per utente:
 *  - Default diversi per ruolo (admin vs tecnico/operatore)
 *  - Persistenza DB (Supabase) con fallback localStorage (demo mode)
 *  - Filtraggio notifiche prima di mostrarle
 *  - API async per lettura/scrittura preferenze
 */

import { db } from './supabase'

// ── Tipi di notifica disponibili ──
export const NOTIF_TYPES = [
  { key: 'new_report',            label: 'Nuova segnalazione creata',      icon: '📋', group: 'segnalazioni' },
  { key: 'quick_report',          label: 'Report rapido creato',           icon: '⚡', group: 'segnalazioni' },
  { key: 'assigned',              label: 'Segnalazione assegnata a me',   icon: '👤', group: 'segnalazioni' },
  { key: 'status_change',         label: 'Cambio stato segnalazione',     icon: '🔄', group: 'segnalazioni' },
  { key: 'comment',               label: 'Nuovo messaggio chat',          icon: '💬', group: 'comunicazione' },
  { key: 'maintenance_taken',     label: 'Manutenzione presa in carico',  icon: '🔧', group: 'manutenzione' },
  { key: 'maintenance_completed', label: 'Manutenzione completata',       icon: '✅', group: 'manutenzione' },
  { key: 'maintenance_reminder',  label: 'Manutenzione in scadenza',      icon: '🔔', group: 'manutenzione' },
  { key: 'maintenance_overdue',   label: 'Manutenzione scaduta',          icon: '⚠️', group: 'manutenzione' },
]

// ── Gruppi per UI ──
export const NOTIF_GROUPS = [
  { key: 'segnalazioni', label: 'Segnalazioni' },
  { key: 'comunicazione', label: 'Comunicazione' },
  { key: 'manutenzione', label: 'Manutenzione' },
]

// ── Default per ruolo (push/in-app) ──
export const ROLE_DEFAULTS = {
  admin: {
    new_report: true,
    quick_report: true,
    assigned: true,
    status_change: true,
    comment: true,
    maintenance_taken: true,
    maintenance_completed: true,
    maintenance_reminder: true,
    maintenance_overdue: true,
    // Email
    email_new_report: true,
    email_quick_report: false,
    email_assigned: true,
    email_status_change: true,
    email_comment: false,
    email_maintenance_taken: true,
    email_maintenance_completed: true,
    email_maintenance_reminder: true,
    email_maintenance_overdue: true,
    email_weekly_digest: true,
  },
  tecnico: {
    new_report: false,
    quick_report: false,
    assigned: true,
    status_change: true,
    comment: true,
    maintenance_taken: false,
    maintenance_completed: false,
    maintenance_reminder: true,
    maintenance_overdue: true,
    // Email
    email_new_report: true,
    email_quick_report: false,
    email_assigned: true,
    email_status_change: true,
    email_comment: false,
    email_maintenance_taken: false,
    email_maintenance_completed: false,
    email_maintenance_reminder: true,
    email_maintenance_overdue: true,
    email_weekly_digest: false,
  },
  operatore: {
    new_report: false,
    quick_report: false,
    assigned: true,
    status_change: true,
    comment: true,
    maintenance_taken: false,
    maintenance_completed: false,
    maintenance_reminder: true,
    maintenance_overdue: true,
    // Email
    email_new_report: false,
    email_quick_report: false,
    email_assigned: true,
    email_status_change: true,
    email_comment: false,
    email_maintenance_taken: false,
    email_maintenance_completed: false,
    email_maintenance_reminder: false,
    email_maintenance_overdue: false,
    email_weekly_digest: false,
  },
}

// ── Tipi notifica email (mirror di NOTIF_TYPES con prefisso email_) ──
export const EMAIL_NOTIF_TYPES = NOTIF_TYPES.map(t => ({
  ...t,
  key: `email_${t.key}`,
}))

// ── Cache in memoria per evitare troppe query ──
const _cache = {
  userPrefs: {},      // { [userId]: { prefs, ts } }
  orgDefaults: null,  // { defaults, ts }
  TTL: 60000,         // 1 minuto
}

function isCacheValid(entry) {
  return entry && (Date.now() - entry.ts) < _cache.TTL
}

// ── Carica preferenze personali dell'utente (async, DB-backed) ──
export async function getUserPrefs(userId) {
  if (!userId) return null

  // Check cache
  if (isCacheValid(_cache.userPrefs[userId])) {
    return _cache.userPrefs[userId].prefs
  }

  try {
    const prefs = await db.getUserNotifPrefs(userId)
    _cache.userPrefs[userId] = { prefs, ts: Date.now() }
    return prefs
  } catch {
    return null
  }
}

// ── Salva preferenze personali (async) ──
export async function saveUserPrefs(userId, prefs, orgId = 'default') {
  if (!userId) return
  _cache.userPrefs[userId] = { prefs, ts: Date.now() }
  try {
    await db.saveUserNotifPrefs(userId, prefs, orgId)
  } catch (err) {
    console.warn('Errore salvataggio preferenze notifiche:', err)
  }
}

// ── Carica default aziendali (async) ──
export async function getOrgDefaults(orgId = 'default') {
  if (isCacheValid(_cache.orgDefaults)) {
    return _cache.orgDefaults.defaults
  }

  try {
    const defaults = await db.getOrgNotifDefaults(orgId)
    _cache.orgDefaults = { defaults, ts: Date.now() }
    return defaults
  } catch {
    return null
  }
}

// ── Salva default aziendali per ruolo (async, solo admin) ──
export async function saveOrgDefaults(orgId = 'default', role, prefs) {
  // Invalida cache
  _cache.orgDefaults = null
  try {
    await db.saveOrgNotifDefaults(orgId, role, prefs)
  } catch (err) {
    console.warn('Errore salvataggio default org:', err)
  }
}

// ── Salva tutti i default org (compatibilità con vecchia API) ──
export async function saveAllOrgDefaults(defaults) {
  _cache.orgDefaults = null
  for (const role of Object.keys(defaults)) {
    try {
      await db.saveOrgNotifDefaults('default', role, defaults[role])
    } catch (err) {
      console.warn(`Errore salvataggio default per ${role}:`, err)
    }
  }
}

// ── Risolvi preferenze effettive (async) ──
export async function getEffectivePrefs(userId, role) {
  // 1. Preferenze personali (priorità massima)
  const personal = await getUserPrefs(userId)
  if (personal) return personal

  // 2. Default aziendali (impostati dall'admin)
  const org = await getOrgDefaults()
  if (org && org[role]) return org[role]

  // 3. Default di sistema per ruolo
  return ROLE_DEFAULTS[role] || ROLE_DEFAULTS.operatore
}

// ── Reset preferenze personali (torna ai default) ──
export async function resetUserPrefs(userId) {
  delete _cache.userPrefs[userId]
  try {
    await db.deleteUserNotifPrefs(userId)
  } catch (e) {
    console.warn('[notifPreferences] resetUserPrefs failed', e)
  }
}

// ── Controlla se una notifica va mostrata (async) ──
export async function shouldShowNotification(notifType, userId, role) {
  const prefs = await getEffectivePrefs(userId, role)
  return prefs[notifType] !== false
}

// ── Versione sincrona per uso in callback critici (usa cache) ──
// Utile quando serve risposta immediata e cache è già stata popolata
export function shouldShowNotificationSync(notifType, userId, role) {
  // Controlla cache utente
  const cached = _cache.userPrefs[userId]
  if (cached?.prefs) return cached.prefs[notifType] !== false

  // Controlla cache org
  if (_cache.orgDefaults?.defaults) {
    const orgPrefs = _cache.orgDefaults.defaults[role]
    if (orgPrefs) return orgPrefs[notifType] !== false
  }

  // Fallback a default ruolo
  const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.operatore
  return defaults[notifType] !== false
}

// ── Pre-load cache (chiamare al login) ──
export async function preloadPrefs(userId, role, orgId = 'default') {
  await Promise.all([
    getUserPrefs(userId),
    getOrgDefaults(orgId),
  ])
}

// ── Ottieni default per ruolo (per UI admin) ──
export function getRoleDefaults(role) {
  return { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.operatore) }
}

// ── Tutti i ruoli disponibili ──
export const ALL_ROLES = [
  { key: 'admin', label: 'Amministratore', icon: '🛡️' },
  { key: 'tecnico', label: 'Tecnico', icon: '🔧' },
  { key: 'operatore', label: 'Operatore', icon: '👷' },
]

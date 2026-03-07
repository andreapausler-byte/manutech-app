/**
 * notifPreferences.js — Sprint 3.7 Notification Preferences
 * 
 * Gestisce le preferenze notifiche per utente:
 *  - Default diversi per ruolo (admin vs tecnico/operatore)
 *  - Persistenza localStorage per preferenze personali
 *  - Persistenza localStorage per default aziendali (admin-set)
 *  - Filtraggio notifiche prima di mostrarle
 */

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

// ── Default per ruolo ──
const ROLE_DEFAULTS = {
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
  },
}

const PREFS_KEY = 'manutech_notif_prefs'
const ORG_DEFAULTS_KEY = 'manutech_notif_org_defaults'

// ── Carica default aziendali (impostati dall'admin) ──
export function getOrgDefaults() {
  try {
    const raw = localStorage.getItem(ORG_DEFAULTS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

// ── Salva default aziendali (solo admin) ──
export function saveOrgDefaults(defaults) {
  try {
    localStorage.setItem(ORG_DEFAULTS_KEY, JSON.stringify(defaults))
  } catch {}
}

// ── Carica preferenze personali dell'utente ──
export function getUserPrefs(userId) {
  try {
    const raw = localStorage.getItem(`${PREFS_KEY}_${userId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

// ── Salva preferenze personali ──
export function saveUserPrefs(userId, prefs) {
  try {
    localStorage.setItem(`${PREFS_KEY}_${userId}`, JSON.stringify(prefs))
  } catch {}
}

// ── Risolvi preferenze effettive (personali > org > default ruolo) ──
export function getEffectivePrefs(userId, role) {
  // 1. Preferenze personali (priorità massima)
  const personal = getUserPrefs(userId)
  if (personal) return personal

  // 2. Default aziendali (impostati dall'admin)
  const org = getOrgDefaults()
  if (org && org[role]) return org[role]

  // 3. Default di sistema per ruolo
  return ROLE_DEFAULTS[role] || ROLE_DEFAULTS.operatore
}

// ── Reset preferenze personali (torna ai default) ──
export function resetUserPrefs(userId) {
  try {
    localStorage.removeItem(`${PREFS_KEY}_${userId}`)
  } catch {}
}

// ── Controlla se una notifica va mostrata ──
export function shouldShowNotification(notifType, userId, role) {
  const prefs = getEffectivePrefs(userId, role)
  return prefs[notifType] !== false // Default true se non specificato
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

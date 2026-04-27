/**
 * SettingsPanel — Sprint 3.7
 * 
 * Pannello slide-in da destra per personalizzazione:
 * - Tema: Chiaro / Scuro / Sistema + 6 accent colors
 * - Notifiche: toggle per tipo (segnalazioni, chat, manutenzione)
 * - Anteprima live
 * - Glove-friendly: touch target grandi
 */

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { X, Sun, Moon, Monitor, Bell, BellOff, Activity, Send, Mail } from 'lucide-react'
import { useHaptic } from '../../hooks/useHaptic'
import toast from 'react-hot-toast'
import { db } from '../../lib/supabase'
import {
  NOTIF_TYPES, NOTIF_GROUPS, EMAIL_NOTIF_TYPES,
  getEffectivePrefs, saveUserPrefs, resetUserPrefs,
} from '../../lib/notifPreferences'

const MODE_OPTIONS = [
  { key: 'light', icon: Sun, label: 'Chiaro', emoji: '☀️' },
  { key: 'dark', icon: Moon, label: 'Scuro', emoji: '🌙' },
  { key: 'auto', icon: Monitor, label: 'Sistema', emoji: '💻' },
]

// ── Diagnostica Push Notifications ──
function PushDiagnostics({ open, userId }) {
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState(null)
  const [testing, setTesting] = useState(false)

  const checkStatus = useCallback(async () => {
    const result = {
      swRegistered: false,
      swState: null,
      notifPermission: typeof Notification !== 'undefined' ? Notification.permission : 'non supportato',
      vapidKey: !!import.meta.env.VITE_VAPID_PUBLIC_KEY,
      pushSubscription: false,
      pushEndpoint: null,
      dbSubscription: false,
    }

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/')
      if (reg) {
        result.swRegistered = true
        result.swState = reg.active ? 'attivo' : reg.installing ? 'installazione' : reg.waiting ? 'in attesa' : 'sconosciuto'
        try {
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            result.pushSubscription = true
            result.pushEndpoint = sub.endpoint.slice(0, 60) + '...'
          }
        } catch { /* push API non disponibile */ }
      }
    }

    // Verifica se la subscription è salvata nel DB
    if (userId) {
      try {
        const subs = await db.getPushSubscriptions?.(userId)
        result.dbSubscription = subs && subs.length > 0
      } catch {
        // getPushSubscriptions potrebbe non esistere
      }
    }

    return result
  }, [userId])

  useEffect(() => {
    if (open && expanded) {
      checkStatus().then(setStatus)
    }
  }, [open, expanded, checkStatus])

  // Invia notifica di test per verificare il pipeline push completo
  const sendTestPush = async () => {
    if (!userId) return
    setTesting(true)
    try {
      await db.addNotification({
        type: 'status_change',
        title: 'Test Push Notification',
        body: 'Se vedi questa notifica con l\'app chiusa, le push funzionano!',
        target_user: userId,
      })
      toast.success('Notifica di test inviata! Chiudi l\'app e attendi qualche secondo.', { duration: 5000 })
    } catch (err) {
      toast.error('Errore invio test: ' + (err.message || 'sconosciuto'))
    } finally {
      setTesting(false)
    }
  }

  const StatusDot = ({ ok }) => (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: ok ? 'var(--color-success, #22c55e)' : 'var(--color-danger)' }}
    />
  )

  // Riassunto stato push
  const allOk = status?.swRegistered && status?.notifPermission === 'granted' &&
    status?.vapidKey && status?.pushSubscription

  return (
    <div className="mt-5">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-[11px] font-medium px-2 py-1.5 rounded-lg press-scale"
        style={{ color: 'var(--color-text-faint)', background: 'var(--color-surface-2)' }}
      >
        <Activity size={12} />
        {expanded ? 'Chiudi diagnostica' : 'Diagnostica push'}
      </button>

      {expanded && status && (
        <div
          className="mt-2 rounded-xl p-3 space-y-1.5"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
        >
          {/* Stato riassuntivo */}
          <div
            className="text-[11px] font-bold mb-2 px-2 py-1.5 rounded-lg"
            style={{
              background: allOk ? 'var(--color-success, #22c55e)15' : 'var(--color-danger)15',
              color: allOk ? 'var(--color-success, #22c55e)' : 'var(--color-danger)',
            }}
          >
            {allOk ? '✓ Push attive — notifiche anche ad app chiusa' : '✗ Push non configurate — notifiche solo in-app'}
          </div>

          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            <StatusDot ok={status.swRegistered} />
            <span>Service Worker: {status.swRegistered ? status.swState : 'non registrato'}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            <StatusDot ok={status.notifPermission === 'granted'} />
            <span>Permesso notifiche: {status.notifPermission}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            <StatusDot ok={status.vapidKey} />
            <span>Chiave VAPID: {status.vapidKey ? 'presente' : 'mancante'}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            <StatusDot ok={status.pushSubscription} />
            <span>Push subscription: {status.pushSubscription ? 'attiva' : 'assente'}</span>
          </div>
          {status.pushEndpoint && (
            <div className="text-[10px] mt-1 break-all" style={{ color: 'var(--color-text-faint)' }}>
              {status.pushEndpoint}
            </div>
          )}

          {/* Azioni */}
          <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
            <button
              onClick={() => checkStatus().then(setStatus)}
              className="text-[10px] font-medium press-scale"
              style={{ color: 'var(--color-primary)' }}
            >
              Aggiorna
            </button>
            {allOk && (
              <button
                onClick={sendTestPush}
                disabled={testing}
                className="flex items-center gap-1 text-[10px] font-medium press-scale ml-auto px-2 py-1 rounded-md"
                style={{
                  color: 'white',
                  background: 'var(--color-primary)',
                  opacity: testing ? 0.6 : 1,
                }}
              >
                <Send size={10} />
                {testing ? 'Invio...' : 'Test push'}
              </button>
            )}
          </div>

          {/* Suggerimento se manca qualcosa */}
          {!allOk && (
            <div className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-faint)' }}>
              {!status.notifPermission || status.notifPermission !== 'granted'
                ? 'Consenti le notifiche dal banner in alto o dalle impostazioni del browser.'
                : !status.pushSubscription
                  ? 'Push subscription mancante. Ricarica la pagina per ritentare.'
                  : !status.vapidKey
                    ? 'Chiave VAPID mancante. Contatta l\'amministratore.'
                    : null
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SettingsPanel({ open, onClose, userId, userRole }) {
  const { mode, accent, setMode, setAccent, presets } = useTheme()
  const haptic = useHaptic()
  const [visible, setVisible] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState({})

  // Carica preferenze notifiche (async da DB)
  useEffect(() => {
    if (userId && userRole) {
      getEffectivePrefs(userId, userRole).then(setNotifPrefs).catch(e => console.error('[SettingsPanel] getEffectivePrefs failed:', e))
    }
  }, [userId, userRole, open])

  // Animazione apertura/chiusura
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [open])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  const handleSetMode = (m) => {
    haptic.light()
    setMode(m)
  }

  const handleSetAccent = (a) => {
    haptic.light()
    setAccent(a)
  }

  const handleToggleNotif = (key) => {
    haptic.light()
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(updated)
    if (userId) saveUserPrefs(userId, updated)
  }

  const handleResetNotifs = async () => {
    haptic.medium()
    if (userId) await resetUserPrefs(userId)
    const prefs = await getEffectivePrefs(userId, userRole)
    setNotifPrefs(prefs)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60]"
      onClick={handleClose}
      style={{
        background: visible ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
        transition: 'background 0.3s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="absolute right-0 top-0 bottom-0 w-[300px] max-w-[85vw] overflow-y-auto"
        style={{
          background: 'var(--color-surface-1)',
          boxShadow: 'var(--shadow-xl)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="p-5 pb-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-7">
            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
              Personalizza
            </h2>
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center press-scale"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Tema ── */}
          <div className="mb-7">
            <div className="label-section mb-3">Tema</div>
            <div className="flex gap-2.5">
              {MODE_OPTIONS.map(({ key, label, emoji }) => (
                <button
                  key={key}
                  onClick={() => handleSetMode(key)}
                  className="flex-1 py-4 rounded-xl text-center press-scale"
                  style={{
                    background: mode === key ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                    border: `2px solid ${mode === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div className="text-2xl mb-1">{emoji}</div>
                  <div
                    className="text-xs font-bold"
                    style={{
                      color: mode === key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Colore Accento ── */}
          <div className="mb-7">
            <div className="label-section mb-3">Colore accento</div>
            <div className="grid grid-cols-2 gap-2.5">
              {presets.map(a => {
                const isActive = accent.name === a.name
                return (
                  <button
                    key={a.name}
                    onClick={() => handleSetAccent(a)}
                    className="flex items-center gap-3 py-3 px-3 rounded-xl text-left press-scale"
                    style={{
                      background: isActive ? `${a.primary}15` : 'var(--color-surface-2)',
                      border: `2px solid ${isActive ? a.primary : 'var(--color-border)'}`,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${a.primary}, ${a.primaryDark})`,
                        boxShadow: isActive ? `0 0 0 3px ${a.primary}30` : 'none',
                        transition: 'box-shadow 0.2s',
                      }}
                    />
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: isActive ? a.primary : 'var(--color-text)',
                      }}
                    >
                      {a.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Anteprima ── */}
          <div className="mb-6">
            <div className="label-section mb-3">Anteprima</div>
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {/* Mini header */}
              <div
                className="h-9 flex items-center px-3 gap-2"
                style={{ background: 'var(--header-bg)', transition: 'background 0.4s ease' }}
              >
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[10px]"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                  🔧
                </div>
                <span className="text-white text-xs font-bold">ManuTech</span>
              </div>
              {/* Mini content */}
              <div className="p-2.5" style={{ background: 'var(--color-bg)', transition: 'background 0.4s ease' }}>
                <div
                  className="rounded-lg p-2.5 mb-2"
                  style={{
                    background: 'var(--color-surface-1)',
                    border: '1px solid var(--color-border)',
                    transition: 'all 0.4s ease',
                  }}
                >
                  <div
                    className="text-[10px] font-semibold mb-1.5"
                    style={{ color: 'var(--color-text)', transition: 'color 0.4s ease' }}
                  >
                    Segnalazione esempio
                  </div>
                  <div className="flex gap-1.5">
                    <span
                      className="px-2 py-0.5 rounded-md text-[8px] font-bold"
                      style={{ background: 'var(--color-danger-glow)', color: 'var(--color-danger)' }}
                    >
                      Critica
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-md text-[8px] font-bold"
                      style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
                    >
                      In lavorazione
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <div
                    className="flex-1 h-1.5 rounded-full"
                    style={{ background: 'var(--color-primary)', opacity: 0.7, transition: 'background 0.4s' }}
                  />
                  <div
                    className="flex-[0.5] h-1.5 rounded-full"
                    style={{ background: 'var(--color-primary)', opacity: 0.3, transition: 'background 0.4s' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Notifiche ── */}
          <div className="mb-7">
            <div className="flex items-center justify-between mb-3">
              <div className="label-section">Notifiche</div>
              <button
                onClick={handleResetNotifs}
                className="text-[11px] font-medium px-2 py-1 rounded-lg press-scale"
                style={{ color: 'var(--color-text-faint)', background: 'var(--color-surface-2)' }}
              >
                Reset
              </button>
            </div>

            {NOTIF_GROUPS.map(group => {
              const items = NOTIF_TYPES.filter(t => t.group === group.key)
              return (
                <div key={group.key} className="mb-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--color-text-faint)' }}>
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {items.map(item => {
                      const enabled = notifPrefs[item.key] !== false
                      return (
                        <button
                          key={item.key}
                          onClick={() => handleToggleNotif(item.key)}
                          className="w-full flex items-center gap-2.5 py-2 px-2.5 rounded-xl press-scale"
                          style={{
                            background: enabled ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <span className="text-base">{item.icon}</span>
                          <span
                            className="flex-1 text-left text-xs font-medium"
                            style={{
                              color: enabled ? 'var(--color-text)' : 'var(--color-text-faint)',
                            }}
                          >
                            {item.label}
                          </span>
                          {/* Toggle */}
                          <div
                            className="w-9 h-5 rounded-full relative shrink-0"
                            style={{
                              background: enabled ? 'var(--color-primary)' : 'var(--color-surface-3)',
                              transition: 'background 0.2s ease',
                            }}
                          >
                            <div
                              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                              style={{
                                left: enabled ? '18px' : '2px',
                                transition: 'left 0.2s ease',
                              }}
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Notifiche Email ── */}
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-3">
              <Mail size={14} style={{ color: 'var(--color-primary)' }} />
              <div className="label-section">Notifiche Email</div>
            </div>

            <div
              className="rounded-lg p-2.5 mb-3"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                Le email arrivano anche con l'app chiusa, senza bisogno di permessi browser.
              </p>
            </div>

            {/* Digest settimanale */}
            <div className="mb-3">
              <button
                onClick={() => handleToggleNotif('email_weekly_digest')}
                className="w-full flex items-center gap-2.5 py-2.5 px-2.5 rounded-xl press-scale"
                style={{
                  background: notifPrefs.email_weekly_digest !== false && notifPrefs.email_weekly_digest !== undefined
                    ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  transition: 'all 0.2s ease',
                }}
              >
                <span className="text-base">📊</span>
                <div className="flex-1 text-left">
                  <span
                    className="text-xs font-medium block"
                    style={{ color: 'var(--color-text)' }}
                  >
                    Riepilogo settimanale
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>
                    KPI e stato segnalazioni ogni lunedì
                  </span>
                </div>
                <div
                  className="w-9 h-5 rounded-full relative shrink-0"
                  style={{
                    background: notifPrefs.email_weekly_digest !== false && notifPrefs.email_weekly_digest !== undefined
                      ? 'var(--color-primary)' : 'var(--color-surface-3)',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                    style={{
                      left: notifPrefs.email_weekly_digest !== false && notifPrefs.email_weekly_digest !== undefined ? '18px' : '2px',
                      transition: 'left 0.2s ease',
                    }}
                  />
                </div>
              </button>
            </div>

            {/* Toggle per tipo */}
            {NOTIF_GROUPS.map(group => {
              const items = EMAIL_NOTIF_TYPES.filter(t => t.group === group.key)
              return (
                <div key={`email_${group.key}`} className="mb-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--color-text-faint)' }}>
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {items.map(item => {
                      const enabled = notifPrefs[item.key] !== false && notifPrefs[item.key] !== undefined
                        ? notifPrefs[item.key] : false
                      return (
                        <button
                          key={item.key}
                          onClick={() => handleToggleNotif(item.key)}
                          className="w-full flex items-center gap-2.5 py-2 px-2.5 rounded-xl press-scale"
                          style={{
                            background: enabled ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <span className="text-base">{item.icon}</span>
                          <span
                            className="flex-1 text-left text-xs font-medium"
                            style={{
                              color: enabled ? 'var(--color-text)' : 'var(--color-text-faint)',
                            }}
                          >
                            {item.label}
                          </span>
                          <div
                            className="w-9 h-5 rounded-full relative shrink-0"
                            style={{
                              background: enabled ? 'var(--color-primary)' : 'var(--color-surface-3)',
                              transition: 'background 0.2s ease',
                            }}
                          >
                            <div
                              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                              style={{
                                left: enabled ? '18px' : '2px',
                                transition: 'left 0.2s ease',
                              }}
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Info ── */}
          <div
            className="rounded-xl p-3.5"
            style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
            }}
          >
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              <strong style={{ color: 'var(--color-text)' }}>💡 Tip:</strong>{' '}
              La modalità "Sistema" segue le preferenze del tuo dispositivo —
              scuro di notte, chiaro di giorno.
            </p>
          </div>

          {/* ── Diagnostica Push ── */}
          <PushDiagnostics open={open} userId={userId} />
        </div>
      </div>
    </div>
  )
}

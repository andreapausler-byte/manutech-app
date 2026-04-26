/**
 * AdminNotifSettings — Sprint 3.7
 * 
 * Pannello admin per configurare i default notifiche
 * per ogni ruolo (admin, tecnico, operatore).
 * 
 * L'admin può impostare quali notifiche riceve ogni ruolo di default.
 * I singoli utenti possono poi personalizzare dal proprio SettingsPanel.
 */

import { useState, useEffect } from 'react'
import { Bell, Save, RotateCcw, Mail } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import {
  NOTIF_TYPES, NOTIF_GROUPS, ALL_ROLES, EMAIL_NOTIF_TYPES,
  getOrgDefaults, saveOrgDefaults, getRoleDefaults,
} from '../../lib/notifPreferences'

export default function AdminNotifSettings() {
  const { user } = useAuth()
  const orgId = user?.org_id
  const [selectedRole, setSelectedRole] = useState('tecnico')
  const [prefs, setPrefs] = useState({})
  const [hasChanges, setHasChanges] = useState(false)
  const toast = useToast()
  const haptic = useHaptic()

  // Carica preferenze per il ruolo selezionato (async da DB)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const orgDefaults = await getOrgDefaults(orgId)
      if (cancelled) return
      if (orgDefaults && orgDefaults[selectedRole]) {
        setPrefs(orgDefaults[selectedRole])
      } else {
        setPrefs(getRoleDefaults(selectedRole))
      }
      setHasChanges(false)
    }
    load()
    return () => { cancelled = true }
  }, [selectedRole, orgId])

  const handleToggle = (key) => {
    haptic.light()
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    haptic.success()
    await saveOrgDefaults(orgId, selectedRole, prefs)
    setHasChanges(false)
    toast.success(`Notifiche ${ALL_ROLES.find(r => r.key === selectedRole)?.label} salvate`)
  }

  const handleReset = async () => {
    haptic.medium()
    setPrefs(getRoleDefaults(selectedRole))
    // Salva i default di sistema per questo ruolo
    await saveOrgDefaults(orgId, selectedRole, getRoleDefaults(selectedRole))
    setHasChanges(false)
    toast.success('Ripristinati default di sistema')
  }

  const handleToggleAll = (group, enable) => {
    haptic.light()
    const items = NOTIF_TYPES.filter(t => t.group === group)
    const updated = { ...prefs }
    items.forEach(item => { updated[item.key] = enable })
    setPrefs(updated)
    setHasChanges(true)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-themed tracking-tight">Gestione Notifiche</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Configura le notifiche predefinite per ogni ruolo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold press-scale transition-colors"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
          >
            <RotateCcw size={15} /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white press-scale transition-all disabled:opacity-40"
            style={{
              background: hasChanges ? 'var(--color-primary)' : 'var(--color-surface-3)',
              boxShadow: hasChanges ? 'var(--shadow-glow-primary)' : 'none',
            }}
          >
            <Save size={15} /> Salva
          </button>
        </div>
      </div>

      {/* Role selector */}
      <div
        className="rounded-2xl p-1.5 flex gap-1"
        style={{ background: 'var(--color-surface-0)' }}
      >
        {ALL_ROLES.map(role => (
          <button
            key={role.key}
            onClick={() => { haptic.light(); setSelectedRole(role.key) }}
            className="flex-1 py-3 rounded-xl text-center press-scale transition-all"
            style={{
              background: selectedRole === role.key ? 'var(--color-primary)' : 'transparent',
              color: selectedRole === role.key ? 'white' : 'var(--color-text-muted)',
              boxShadow: selectedRole === role.key ? 'var(--shadow-glow-primary)' : 'none',
            }}
          >
            <span className="text-lg block mb-0.5">{role.icon}</span>
            <span className="text-sm font-bold">{role.label}</span>
          </button>
        ))}
      </div>

      {/* Info */}
      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: 'var(--color-primary-glow)', border: '1px solid var(--color-border-active)' }}
      >
        <Bell size={18} style={{ color: 'var(--color-primary)' }} className="shrink-0 mt-0.5" />
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Queste impostazioni definiscono le notifiche predefinite per tutti gli utenti con ruolo{' '}
          <strong style={{ color: 'var(--color-text)' }}>
            {ALL_ROLES.find(r => r.key === selectedRole)?.label}
          </strong>.
          I singoli utenti possono personalizzarle dal proprio pannello impostazioni.
        </p>
      </div>

      {/* Notification groups */}
      {NOTIF_GROUPS.map(group => {
        const items = NOTIF_TYPES.filter(t => t.group === group.key)
        const allEnabled = items.every(item => prefs[item.key] !== false)
        const noneEnabled = items.every(item => prefs[item.key] === false)

        return (
          <div
            key={group.key}
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}
          >
            {/* Group header */}
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {group.label}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
                  Push
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
                  Email
                </span>
              </div>
            </div>

            {/* Items — doppio toggle push + email */}
            {items.map((item, idx) => {
              const pushEnabled = prefs[item.key] !== false
              const emailKey = `email_${item.key}`
              const emailEnabled = !!prefs[emailKey]
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-4 px-5 py-3.5"
                  style={{
                    borderTop: idx > 0 ? '1px solid var(--color-border-subtle)' : 'none',
                  }}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span
                    className="flex-1 text-sm font-medium"
                    style={{ color: pushEnabled || emailEnabled ? 'var(--color-text)' : 'var(--color-text-faint)' }}
                  >
                    {item.label}
                  </span>
                  {/* Push toggle */}
                  <button
                    onClick={() => handleToggle(item.key)}
                    className="press-scale"
                    title="Push notification"
                  >
                    <div
                      className="w-11 h-6 rounded-full relative shrink-0"
                      style={{
                        background: pushEnabled ? 'var(--color-primary)' : 'var(--color-surface-3)',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
                        style={{
                          left: pushEnabled ? '22px' : '2px',
                          transition: 'left 0.2s ease',
                        }}
                      />
                    </div>
                  </button>
                  {/* Email toggle */}
                  <button
                    onClick={() => handleToggle(emailKey)}
                    className="press-scale"
                    title="Email notification"
                  >
                    <div
                      className="w-11 h-6 rounded-full relative shrink-0"
                      style={{
                        background: emailEnabled ? '#6366f1' : 'var(--color-surface-3)',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
                        style={{
                          left: emailEnabled ? '22px' : '2px',
                          transition: 'left 0.2s ease',
                        }}
                      />
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Digest settimanale */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <Mail size={16} style={{ color: '#6366f1' }} />
            <span className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Riepilogo settimanale
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 px-5 py-3.5">
          <span className="text-xl">📊</span>
          <div className="flex-1">
            <span className="text-sm font-medium block" style={{ color: 'var(--color-text)' }}>
              Email riepilogo settimanale
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
              KPI, segnalazioni e manutenzione — ogni lunedì
            </span>
          </div>
          <button
            onClick={() => handleToggle('email_weekly_digest')}
            className="press-scale"
          >
            <div
              className="w-11 h-6 rounded-full relative shrink-0"
              style={{
                background: prefs.email_weekly_digest ? '#6366f1' : 'var(--color-surface-3)',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
                style={{
                  left: prefs.email_weekly_digest ? '22px' : '2px',
                  transition: 'left 0.2s ease',
                }}
              />
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

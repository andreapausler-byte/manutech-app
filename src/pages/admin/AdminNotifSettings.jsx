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
import { Bell, Save, RotateCcw } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import {
  NOTIF_TYPES, NOTIF_GROUPS, ALL_ROLES,
  getOrgDefaults, saveOrgDefaults, getRoleDefaults,
} from '../../lib/notifPreferences'

export default function AdminNotifSettings() {
  const [selectedRole, setSelectedRole] = useState('tecnico')
  const [prefs, setPrefs] = useState({})
  const [hasChanges, setHasChanges] = useState(false)
  const toast = useToast()
  const haptic = useHaptic()

  // Carica preferenze per il ruolo selezionato
  useEffect(() => {
    const orgDefaults = getOrgDefaults()
    if (orgDefaults && orgDefaults[selectedRole]) {
      setPrefs(orgDefaults[selectedRole])
    } else {
      setPrefs(getRoleDefaults(selectedRole))
    }
    setHasChanges(false)
  }, [selectedRole])

  const handleToggle = (key) => {
    haptic.light()
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }))
    setHasChanges(true)
  }

  const handleSave = () => {
    haptic.success()
    const orgDefaults = getOrgDefaults() || {}
    orgDefaults[selectedRole] = prefs
    saveOrgDefaults(orgDefaults)
    setHasChanges(false)
    toast.success(`Notifiche ${ALL_ROLES.find(r => r.key === selectedRole)?.label} salvate`)
  }

  const handleReset = () => {
    haptic.medium()
    setPrefs(getRoleDefaults(selectedRole))
    // Rimuovi override aziendali per questo ruolo
    const orgDefaults = getOrgDefaults() || {}
    delete orgDefaults[selectedRole]
    saveOrgDefaults(orgDefaults)
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleAll(group.key, true)}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg press-scale"
                  style={{
                    background: allEnabled ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                    color: allEnabled ? 'var(--color-primary)' : 'var(--color-text-faint)',
                  }}
                >
                  Tutte On
                </button>
                <button
                  onClick={() => handleToggleAll(group.key, false)}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg press-scale"
                  style={{
                    background: noneEnabled ? 'var(--color-danger-glow)' : 'var(--color-surface-2)',
                    color: noneEnabled ? 'var(--color-danger)' : 'var(--color-text-faint)',
                  }}
                >
                  Tutte Off
                </button>
              </div>
            </div>

            {/* Items */}
            {items.map((item, idx) => {
              const enabled = prefs[item.key] !== false
              return (
                <button
                  key={item.key}
                  onClick={() => handleToggle(item.key)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors press-scale"
                  style={{
                    borderTop: idx > 0 ? '1px solid var(--color-border-subtle)' : 'none',
                    background: enabled ? 'transparent' : 'var(--color-surface-0)',
                  }}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span
                    className="flex-1 text-sm font-medium"
                    style={{ color: enabled ? 'var(--color-text)' : 'var(--color-text-faint)' }}
                  >
                    {item.label}
                  </span>
                  {/* Toggle switch */}
                  <div
                    className="w-11 h-6 rounded-full relative shrink-0"
                    style={{
                      background: enabled ? 'var(--color-primary)' : 'var(--color-surface-3)',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    <div
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
                      style={{
                        left: enabled ? '22px' : '2px',
                        transition: 'left 0.2s ease',
                      }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

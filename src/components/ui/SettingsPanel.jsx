/**
 * SettingsPanel — Sprint Design 0
 * 
 * Pannello slide-in da destra per personalizzazione tema.
 * - 3 opzioni tema: Chiaro / Scuro / Sistema
 * - 6 accent color preset con anteprima live
 * - Anteprima mini dell'app con tema attuale
 * - Glove-friendly: touch target grandi
 */

import { useState, useEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { X, Sun, Moon, Monitor } from 'lucide-react'
import { useHaptic } from '../../hooks/useHaptic'

const MODE_OPTIONS = [
  { key: 'light', icon: Sun, label: 'Chiaro', emoji: '☀️' },
  { key: 'dark', icon: Moon, label: 'Scuro', emoji: '🌙' },
  { key: 'auto', icon: Monitor, label: 'Sistema', emoji: '💻' },
]

export default function SettingsPanel({ open, onClose }) {
  const { mode, accent, setMode, setAccent, presets, resolved } = useTheme()
  const haptic = useHaptic()
  const [visible, setVisible] = useState(false)

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
        </div>
      </div>
    </div>
  )
}

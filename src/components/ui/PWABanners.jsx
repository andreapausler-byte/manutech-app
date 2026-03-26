/**
 * PWABanners — Banner installazione premium
 *
 * Strategie:
 *  1. InstallBanner — Fullscreen overlay primo accesso, poi banner persistente
 *  2. SafariInstallGuide — Guida step-by-step per iOS
 *  3. NotifPermissionBanner — Richiesta notifiche push
 *
 * Il banner di installazione è aggressivo ma elegante:
 *  - Primo accesso: overlay fullscreen con benefici chiari
 *  - Visite successive: banner compatto ma ben visibile
 *  - Dopo dismiss: riappare dopo 3 giorni (non 7)
 *  - Se installata: non appare mai più
 */

import { useState, useEffect } from 'react'
import { Download, Bell, X, Share, PlusSquare, ChevronDown, Smartphone, Zap, WifiOff, ShieldCheck } from 'lucide-react'
import { useHaptic } from '../../hooks/useHaptic'

const DISMISS_KEY_INSTALL = 'manutech_pwa_install_dismissed'
const DISMISS_KEY_INSTALL_FULL = 'manutech_pwa_install_full_shown'
const DISMISS_KEY_SAFARI = 'manutech_pwa_safari_dismissed'
const DISMISS_KEY_NOTIF = 'manutech_pwa_notif_dismissed'
const DISMISS_DAYS = 3

function wasDismissed(key, days = DISMISS_DAYS) {
  try {
    const ts = localStorage.getItem(key)
    if (!ts) return false
    return (Date.now() - parseInt(ts)) < days * 86400000
  } catch { return false }
}

function dismiss(key) {
  try { localStorage.setItem(key, Date.now().toString()) } catch {}
}

function isSafariIOS() {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua)
  return isIOS && isSafari
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// ── Banner Installazione (Chrome/Edge) — Premium ──
export function InstallBanner({ canInstall, onInstall }) {
  const [showFull, setShowFull] = useState(false)
  const [showCompact, setShowCompact] = useState(false)
  const haptic = useHaptic()

  useEffect(() => {
    if (!canInstall || isStandalone()) return

    // Prima volta: mostra overlay fullscreen
    if (!wasDismissed(DISMISS_KEY_INSTALL_FULL, 30)) {
      const t = setTimeout(() => setShowFull(true), 2000)
      return () => clearTimeout(t)
    }

    // Visite successive: banner compatto
    if (!wasDismissed(DISMISS_KEY_INSTALL)) {
      const t = setTimeout(() => setShowCompact(true), 1500)
      return () => clearTimeout(t)
    }
  }, [canInstall])

  // ── Overlay fullscreen (primo accesso) ──
  if (showFull) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
        <div style={{
          width: '100%', maxWidth: 440, padding: '32px 24px 40px',
          background: 'var(--color-surface-1)',
          borderRadius: '24px 24px 0 0',
          animation: 'slideUp 0.4s var(--ease-out-expo)',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(124,106,255,0.3)',
            }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 28, fontFamily: "'Outfit', sans-serif" }}>M</span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)' }}>Installa ManuTech</h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 6 }}>Accedi più velocemente, anche offline</p>
          </div>

          {/* Benefici */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {[
              { icon: Zap, label: 'Accesso istantaneo', desc: 'Un tap dalla home del telefono', color: '#f59e0b' },
              { icon: WifiOff, label: 'Funziona offline', desc: 'Consulta dati anche senza rete', color: '#06b6d4' },
              { icon: Bell, label: 'Notifiche push', desc: 'Avvisi su segnalazioni e scadenze', color: '#7c6aff' },
              { icon: ShieldCheck, label: 'Sempre aggiornata', desc: 'Aggiornamenti automatici', color: '#22c55e' },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 14, background: `${color}08` }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{label}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => { haptic.medium(); onInstall(); setShowFull(false); dismiss(DISMISS_KEY_INSTALL_FULL) }}
            className="press-scale"
            style={{
              width: '100%', padding: '18px 0', borderRadius: 16,
              fontSize: 17, fontWeight: 700, color: '#fff',
              background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 4px 20px rgba(124,106,255,0.35)',
            }}>
            <Download size={22} /> Installa ora
          </button>

          <button
            onClick={() => { setShowFull(false); dismiss(DISMISS_KEY_INSTALL_FULL); setShowCompact(false); dismiss(DISMISS_KEY_INSTALL) }}
            style={{
              width: '100%', padding: '14px 0', marginTop: 10,
              fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)',
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
            Non ora, continua nel browser
          </button>
        </div>
      </div>
    )
  }

  // ── Banner compatto (visite successive) ──
  if (showCompact) {
    return (
      <div
        className="mx-[4vw] mb-[3vw] rounded-2xl overflow-hidden animate-slide-up"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
          boxShadow: '0 4px 24px rgba(124,106,255,0.3)',
        }}
      >
        <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Smartphone size={24} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Installa ManuTech</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>Accesso rapido + notifiche + offline</p>
          </div>
          <button
            onClick={() => { haptic.medium(); onInstall() }}
            className="press-scale"
            style={{
              padding: '10px 18px', borderRadius: 12,
              fontSize: 14, fontWeight: 700,
              background: '#fff', color: 'var(--color-primary)',
              border: 'none', cursor: 'pointer',
              flexShrink: 0,
            }}>
            Installa
          </button>
          <button
            onClick={() => { dismiss(DISMISS_KEY_INSTALL); setShowCompact(false) }}
            style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ── Guida Installazione Safari iOS — Premium ──
export function SafariInstallGuide() {
  const [visible, setVisible] = useState(false)
  const haptic = useHaptic()

  useEffect(() => {
    if (isSafariIOS() && !isStandalone() && !wasDismissed(DISMISS_KEY_SAFARI)) {
      const t = setTimeout(() => setVisible(true), 2000)
      return () => clearTimeout(t)
    }
  }, [])

  if (!visible) return null

  const steps = [
    { num: 1, icon: Share, text: 'Tocca il pulsante Condividi', sub: 'In basso nella barra di Safari' },
    { num: 2, icon: PlusSquare, text: '"Aggiungi alla schermata Home"', sub: 'Scorri nel menu che appare' },
    { num: 3, icon: Download, text: 'Tocca "Aggiungi"', sub: 'ManuTech apparirà come app' },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div style={{
        width: '100%', maxWidth: 440, padding: '28px 24px 36px',
        background: 'var(--color-surface-1)', borderRadius: '24px 24px 0 0',
        animation: 'slideUp 0.4s var(--ease-out-expo)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 24, fontFamily: "'Outfit', sans-serif" }}>M</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)' }}>Installa ManuTech su iPhone</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>3 semplici passaggi</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {steps.map(({ num, icon: Icon, text, sub }, i) => (
            <div key={num}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                  background: 'var(--color-primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800,
                }}>
                  {num}
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {text}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 8,
                      background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                    }}>
                      <Icon size={14} style={{ color: 'var(--color-primary)' }} />
                    </span>
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                  <ChevronDown size={16} style={{ color: 'var(--color-text-faint)' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          padding: '12px 16px', borderRadius: 14, marginBottom: 20,
          background: 'var(--color-warning-glow)', border: '1px solid rgba(245,158,11,0.15)',
        }}>
          <p style={{ fontSize: 13, color: 'var(--color-warning)', lineHeight: 1.5 }}>
            <strong>💡</strong> Le notifiche push su iPhone funzionano solo dopo l'installazione.
          </p>
        </div>

        <button
          onClick={() => { dismiss(DISMISS_KEY_SAFARI); setVisible(false) }}
          className="press-scale"
          style={{
            width: '100%', padding: '16px 0', borderRadius: 14,
            fontSize: 15, fontWeight: 700, color: '#fff',
            background: 'var(--color-primary)', border: 'none', cursor: 'pointer',
          }}>
          Ho capito!
        </button>
      </div>
    </div>
  )
}

// ── Banner Notifiche ──
export function NotifPermissionBanner({ permission, onRequest }) {
  const [visible, setVisible] = useState(false)
  const haptic = useHaptic()

  useEffect(() => {
    if (permission === 'default' && !wasDismissed(DISMISS_KEY_NOTIF)) {
      const t = setTimeout(() => setVisible(true), 4000)
      return () => clearTimeout(t)
    }
  }, [permission])

  if (!visible || permission !== 'default') return null

  return (
    <div
      className="mx-[4vw] mb-[3vw] rounded-2xl overflow-hidden animate-slide-up"
      style={{ background: 'var(--color-surface-1)', border: '1.5px solid var(--color-primary)', boxShadow: '0 4px 20px rgba(124,106,255,0.15)' }}
    >
      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: 'var(--color-primary-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bell size={22} style={{ color: 'var(--color-primary)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Attiva le notifiche</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Ricevi avvisi su segnalazioni e scadenze</p>
        </div>
        <button
          onClick={async () => { haptic.medium(); await onRequest(); setVisible(false) }}
          className="press-scale"
          style={{
            padding: '10px 18px', borderRadius: 12, fontSize: 14, fontWeight: 700,
            background: 'var(--color-primary)', color: '#fff',
            border: 'none', cursor: 'pointer', flexShrink: 0,
          }}>
          Attiva
        </button>
        <button
          onClick={() => { dismiss(DISMISS_KEY_NOTIF); setVisible(false) }}
          style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-faint)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

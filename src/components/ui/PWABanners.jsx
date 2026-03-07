/**
 * PWABanners — Sprint 3.6b
 * 
 * Tre banner contestuali:
 *  1. InstallBanner — "Installa ManuTech" (Chrome/Edge — prompt automatico)
 *  2. SafariInstallGuide — Guida passo-passo per Safari iOS (icona ↑)
 *  3. NotifBanner — "Attiva le notifiche" (appare dopo il primo login)
 * 
 * Tutti dismissabili, non riappaiono per 7 giorni dopo il dismiss.
 */

import { useState, useEffect } from 'react'
import { Download, Bell, X, Share, PlusSquare, ChevronDown } from 'lucide-react'
import { useHaptic } from '../../hooks/useHaptic'

const DISMISS_KEY_INSTALL = 'manutech_pwa_install_dismissed'
const DISMISS_KEY_SAFARI = 'manutech_pwa_safari_dismissed'
const DISMISS_KEY_NOTIF = 'manutech_pwa_notif_dismissed'
const DISMISS_DAYS = 7

function wasDismissed(key) {
  try {
    const ts = localStorage.getItem(key)
    if (!ts) return false
    const diff = Date.now() - parseInt(ts)
    return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch { return false }
}

function dismiss(key) {
  try { localStorage.setItem(key, Date.now().toString()) } catch {}
}

// ── Detect Safari iOS ──
function isSafariIOS() {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua)
  return isIOS && isSafari
}

// ── Detect if already installed as PWA ──
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// ── Banner Installazione (Chrome/Edge) ──
export function InstallBanner({ canInstall, onInstall }) {
  const [visible, setVisible] = useState(false)
  const haptic = useHaptic()

  useEffect(() => {
    if (canInstall && !wasDismissed(DISMISS_KEY_INSTALL)) {
      const t = setTimeout(() => setVisible(true), 3000)
      return () => clearTimeout(t)
    }
  }, [canInstall])

  if (!visible) return null

  return (
    <div
      className="mx-[4vw] mb-[3vw] rounded-2xl p-[4vw] flex items-center gap-[3vw] animate-slide-up"
      style={{
        background: 'var(--gradient-primary)',
        boxShadow: 'var(--shadow-glow-primary)',
      }}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,255,255,0.15)' }}>
        <Download size={22} color="white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white">Installa ManuTech</p>
        <p className="text-sm text-white/70">Accesso rapido dalla home del telefono</p>
      </div>
      <button
        onClick={() => { haptic.medium(); onInstall() }}
        className="px-4 py-2.5 rounded-xl text-sm font-bold press-scale shrink-0"
        style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
      >
        Installa
      </button>
      <button
        onClick={() => { dismiss(DISMISS_KEY_INSTALL); setVisible(false) }}
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ color: 'rgba(255,255,255,0.5)' }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

// ── Guida Installazione Safari iOS ──
export function SafariInstallGuide() {
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const haptic = useHaptic()

  useEffect(() => {
    // Mostra solo su Safari iOS, se non già installata, se non dismissed
    if (isSafariIOS() && !isStandalone() && !wasDismissed(DISMISS_KEY_SAFARI)) {
      const t = setTimeout(() => setVisible(true), 3000)
      return () => clearTimeout(t)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className="mx-[4vw] mb-[3vw] rounded-2xl overflow-hidden animate-slide-up"
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {/* Header — sempre visibile */}
      <div className="p-[4vw] flex items-center gap-[3vw]">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-primary-glow)' }}>
          <Download size={22} style={{ color: 'var(--color-primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-themed">Installa ManuTech</p>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Aggiungi l'app alla Home del tuo iPhone
          </p>
        </div>
        <button
          onClick={() => { haptic.light(); setExpanded(!expanded) }}
          className="px-3.5 py-2.5 rounded-xl text-sm font-bold press-scale shrink-0"
          style={{ background: 'var(--color-primary)', color: 'white' }}
        >
          {expanded ? 'Chiudi' : 'Come fare'}
        </button>
        <button
          onClick={() => { dismiss(DISMISS_KEY_SAFARI); setVisible(false) }}
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ color: 'var(--color-text-faint)' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Steps — espandibile */}
      {expanded && (
        <div
          className="px-[4vw] pb-[4vw] animate-fade-in"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <div className="pt-[3vw] space-y-[3.5vw]">
            {/* Step 1 */}
            <div className="flex items-start gap-[3vw]">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                1
              </div>
              <div className="flex-1 pt-1.5">
                <p className="text-base font-bold text-themed">
                  Tocca il pulsante Condividi
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                  L'icona{' '}
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md mx-0.5 align-middle"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                  >
                    <Share size={14} style={{ color: 'var(--color-primary)' }} />
                  </span>
                  {' '}in basso nella barra di Safari
                </p>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ChevronDown size={18} style={{ color: 'var(--color-text-faint)' }} />
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-[3vw]">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                2
              </div>
              <div className="flex-1 pt-1.5">
                <p className="text-base font-bold text-themed">
                  Scorri e tocca "Aggiungi alla schermata Home"
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                  L'icona{' '}
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md mx-0.5 align-middle"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                  >
                    <PlusSquare size={14} style={{ color: 'var(--color-primary)' }} />
                  </span>
                  {' '}nel menu che appare
                </p>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ChevronDown size={18} style={{ color: 'var(--color-text-faint)' }} />
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-[3vw]">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                3
              </div>
              <div className="flex-1 pt-1.5">
                <p className="text-base font-bold text-themed">
                  Tocca "Aggiungi"
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                  ManuTech apparirà sulla Home come un'app nativa
                </p>
              </div>
            </div>

            {/* Nota notifiche */}
            <div
              className="rounded-xl p-3.5 mt-1"
              style={{
                background: 'var(--color-warning-glow)',
                border: '1px solid rgba(245, 158, 11, 0.15)',
              }}
            >
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-warning)' }}>
                <strong>💡 Nota:</strong> Le notifiche push su iPhone funzionano 
                solo dopo l'installazione dalla Home. Apri l'app dall'icona sulla 
                Home per attivarle.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Banner Notifiche ──
export function NotifPermissionBanner({ permission, onRequest }) {
  const [visible, setVisible] = useState(false)
  const haptic = useHaptic()

  useEffect(() => {
    if (permission === 'default' && !wasDismissed(DISMISS_KEY_NOTIF)) {
      const t = setTimeout(() => setVisible(true), 5000)
      return () => clearTimeout(t)
    }
  }, [permission])

  if (!visible || permission !== 'default') return null

  return (
    <div
      className="mx-[4vw] mb-[3vw] rounded-2xl p-[4vw] flex items-center gap-[3vw] animate-slide-up"
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--color-primary-glow)' }}>
        <Bell size={22} style={{ color: 'var(--color-primary)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-themed">Attiva le notifiche</p>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Ricevi avvisi su assegnazioni e scadenze
        </p>
      </div>
      <button
        onClick={async () => {
          haptic.medium()
          await onRequest()
          setVisible(false)
        }}
        className="px-4 py-2.5 rounded-xl text-sm font-bold text-white press-scale shrink-0"
        style={{ background: 'var(--color-primary)', boxShadow: 'var(--shadow-glow-primary)' }}
      >
        Attiva
      </button>
      <button
        onClick={() => { dismiss(DISMISS_KEY_NOTIF); setVisible(false) }}
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ color: 'var(--color-text-faint)' }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

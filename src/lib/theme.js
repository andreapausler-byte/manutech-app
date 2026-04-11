/**
 * ManuTech Theme Engine — Design System v2
 *
 * Palette dark/light con toggle.
 * Compatibile con il token system CSS variables.
 */

// ── Accent Presets (mantenuti per compatibilità) ──────────
export const ACCENT_PRESETS = [
  { name: 'Default',          primary: '#7c6aff', primaryLight: '#9d8cff', primaryDark: '#5b47e0' },
  { name: 'Oceano',           primary: '#1D6FA5', primaryLight: '#E6F2FA', primaryDark: '#0E4D75' },
  { name: 'Ambra',            primary: '#B8860B', primaryLight: '#FFF6E0', primaryDark: '#8B6508' },
  { name: 'Vulcano',          primary: '#C0392B', primaryLight: '#FDECEA', primaryDark: '#922B21' },
  { name: 'Grafite',          primary: '#4A5568', primaryLight: '#EDF2F7', primaryDark: '#2D3748' },
  { name: 'Viola',            primary: '#7C3AED', primaryLight: '#F0EAFF', primaryDark: '#5B21B6' },
  { name: 'Industrial Blue',  primary: '#3B82F6', primaryLight: '#DBEAFE', primaryDark: '#1D4ED8' },
]

// ── Default ───────────────────────────────────────────────
export const DEFAULT_ACCENT = ACCENT_PRESETS[0]
export const DEFAULT_MODE = 'dark'

// ── Generatore tema ───────────────────────────────────────
export function makeTheme(mode, accent) {
  const a = accent || DEFAULT_ACCENT

  if (mode === 'dark') {
    return {
      // Brand / Primary
      '--color-primary': a.primary,
      '--color-primary-light': lightenHex(a.primary, 0.3),
      '--color-primary-dark': a.primaryDark,
      '--color-primary-glow': `${a.primary}25`,

      // Semantic
      '--color-success': '#3ddc84',
      '--color-success-glow': 'rgba(61,220,132,0.10)',
      '--color-warning': '#ffaa2c',
      '--color-warning-glow': 'rgba(255,170,44,0.10)',
      '--color-danger': '#ff5c5c',
      '--color-danger-glow': 'rgba(255,92,92,0.10)',
      '--color-critical': '#ff5c5c',
      '--color-info': '#00d4ff',

      // Design System — DARK palette
      '--color-bg': '#0a0a0f',
      '--color-bg-subtle': '#0e0e14',
      '--color-surface-0': '#12121a',
      '--color-surface-1': '#12121a',
      '--color-surface-2': '#16161f',
      '--color-surface-3': '#1a1a26',
      '--color-surface-elevated': 'rgba(18, 18, 26, 0.88)',

      // Card
      '--color-card': '#16161f',
      '--color-card-hover': '#1e1e2a',

      // Borders
      '--color-border': '#2a2a3a',
      '--color-border-subtle': '#222233',
      '--color-border-hover': '#3a3a4a',
      '--color-border-active': `${a.primary}50`,

      // Text
      '--color-text': '#e8e8f0',
      '--color-text-secondary': '#8888a0',
      '--color-text-muted': '#5a5a72',
      '--color-text-faint': '#5a5a72',

      // Status colors
      '--color-cyan': '#00d4ff',
      '--color-cyan-bg': 'rgba(0,212,255,0.10)',
      '--color-green': '#3ddc84',
      '--color-green-bg': 'rgba(61,220,132,0.10)',
      '--color-red': '#ff5c5c',
      '--color-red-bg': 'rgba(255,92,92,0.10)',
      '--color-orange': '#ffaa2c',
      '--color-orange-bg': 'rgba(255,170,44,0.10)',
      '--color-yellow': '#ffe066',
      '--color-yellow-bg': 'rgba(255,224,102,0.10)',

      // Shadows
      '--shadow-xs': '0 1px 2px rgba(0, 0, 0, 0.3)',
      '--shadow-sm': '0 2px 8px rgba(0,0,0,0.3)',
      '--shadow-md': '0 2px 12px rgba(0,0,0,0.4)',
      '--shadow-lg': '0 8px 32px rgba(0,0,0,0.4)',
      '--shadow-xl': '0 16px 48px rgba(0,0,0,0.5)',
      '--shadow-glow-primary': `0 0 20px ${a.primary}20, 0 0 60px ${a.primary}08`,

      // Glass
      '--glass-bg': 'rgba(18, 18, 26, 0.88)',
      '--glass-bg-heavy': 'rgba(15, 15, 23, 0.92)',
      '--glass-blur': '16px',
      '--glass-blur-heavy': '24px',
      '--glass-border': '#2a2a3a',

      // Gradients
      '--gradient-surface': 'linear-gradient(145deg, #16161f 0%, #12121a 100%)',
      '--gradient-card': 'linear-gradient(160deg, rgba(22, 22, 31, 0.5) 0%, rgba(18, 18, 26, 0.3) 100%)',
      '--gradient-primary': `linear-gradient(135deg, ${a.primary} 0%, #00d4ff 100%)`,

      // Header
      '--header-bg': `linear-gradient(135deg, ${a.primary}, #00d4ff)`,
      '--header-text': '#ffffff',

      // Meta
      '--theme-color': '#0a0a0f',
    }
  }

  // ── Light Mode ──────────────────────────────────────────
  const primaryLight = a.name === 'Default' ? '#6347ff' : a.primary
  return {
    '--color-primary': primaryLight,
    '--color-primary-light': a.primaryLight,
    '--color-primary-dark': a.primaryDark,
    '--color-primary-glow': `${primaryLight}15`,

    '--color-success': '#1aab5c',
    '--color-success-glow': 'rgba(26,171,92,0.08)',
    '--color-warning': '#dd8800',
    '--color-warning-glow': 'rgba(221,136,0,0.08)',
    '--color-danger': '#e53e3e',
    '--color-danger-glow': 'rgba(229,62,62,0.08)',
    '--color-critical': '#e53e3e',
    '--color-info': '#0099cc',

    '--color-bg': '#f4f5f7',
    '--color-bg-subtle': '#f0f1f5',
    '--color-surface-0': '#ffffff',
    '--color-surface-1': '#ffffff',
    '--color-surface-2': '#f0f1f5',
    '--color-surface-3': '#f0f1f5',
    '--color-surface-elevated': 'rgba(255, 255, 255, 0.92)',

    '--color-card': '#ffffff',
    '--color-card-hover': '#f8f8fc',

    '--color-border': '#e2e4ea',
    '--color-border-subtle': '#eef0f4',
    '--color-border-hover': '#d0d2d8',
    '--color-border-active': `${primaryLight}40`,

    '--color-text': '#1a1a2e',
    '--color-text-secondary': '#5a5a72',
    '--color-text-muted': '#8888a0',
    '--color-text-faint': '#8888a0',

    '--color-cyan': '#0099cc',
    '--color-cyan-bg': 'rgba(0,153,204,0.08)',
    '--color-green': '#1aab5c',
    '--color-green-bg': 'rgba(26,171,92,0.08)',
    '--color-red': '#e53e3e',
    '--color-red-bg': 'rgba(229,62,62,0.08)',
    '--color-orange': '#dd8800',
    '--color-orange-bg': 'rgba(221,136,0,0.08)',
    '--color-yellow': '#cc9900',
    '--color-yellow-bg': 'rgba(204,153,0,0.08)',

    '--shadow-xs': '0 1px 2px rgba(0, 0, 0, 0.04)',
    '--shadow-sm': '0 2px 8px rgba(0,0,0,0.06)',
    '--shadow-md': '0 2px 12px rgba(0,0,0,0.06)',
    '--shadow-lg': '0 4px 24px rgba(0,0,0,0.10)',
    '--shadow-xl': '0 8px 48px rgba(0,0,0,0.12)',
    '--shadow-glow-primary': `0 0 20px ${primaryLight}10, 0 0 60px ${primaryLight}05`,

    '--glass-bg': 'rgba(255, 255, 255, 0.88)',
    '--glass-bg-heavy': 'rgba(255, 255, 255, 0.95)',
    '--glass-blur': '16px',
    '--glass-blur-heavy': '24px',
    '--glass-border': '#e2e4ea',

    '--gradient-surface': 'linear-gradient(145deg, #FFFFFF 0%, #f4f5f7 100%)',
    '--gradient-card': 'linear-gradient(160deg, rgba(255, 255, 255, 0.8) 0%, rgba(244, 245, 247, 0.4) 100%)',
    '--gradient-primary': `linear-gradient(135deg, ${primaryLight} 0%, #0099cc 100%)`,

    '--header-bg': `linear-gradient(135deg, ${primaryLight}, #0099cc)`,
    '--header-text': '#ffffff',

    '--theme-color': primaryLight,
  }
}

// ── Applica tema al DOM ───────────────────────────────────
export function applyTheme(themeVars) {
  const root = document.documentElement
  Object.entries(themeVars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })

  // Aggiorna meta theme-color per la barra di stato mobile
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && themeVars['--theme-color']) {
    meta.setAttribute('content', themeVars['--theme-color'])
  }
}

// ── Persistenza localStorage ──────────────────────────────
const STORAGE_KEY = 'manutech_theme'

export function saveThemePrefs(mode, accentName) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, accentName }))
  } catch {}
}

export function loadThemePrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const { mode, accentName } = JSON.parse(raw)
    const accent = ACCENT_PRESETS.find(a => a.name === accentName) || DEFAULT_ACCENT
    return { mode: mode || DEFAULT_MODE, accent }
  } catch {
    return null
  }
}

// ── Resolve "auto" mode ───────────────────────────────────
export function resolveMode(mode) {
  if (mode === 'auto') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

// ── Utility: lighten hex color ────────────────────────────
function lightenHex(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + Math.round(255 * amount))
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * amount))
  const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * amount))
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
}

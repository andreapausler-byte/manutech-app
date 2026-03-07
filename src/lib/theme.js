/**
 * ManuTech Theme Engine — Sprint Design 0
 * 
 * Genera 30+ CSS variables dalla combinazione mode + accent.
 * Compatibile al 100% con il token system esistente (Sprint 2.4).
 * 
 * Uso:
 *   const theme = makeTheme('dark', ACCENT_PRESETS[0])
 *   applyTheme(theme) // inietta le variabili in :root
 */

// ── 6 Accent Presets ────────────────────────────────────────
export const ACCENT_PRESETS = [
  { name: 'Amarcord',  primary: '#1B6B4A', primaryLight: '#E8F5EE', primaryDark: '#0D4A30' },
  { name: 'Oceano',    primary: '#1D6FA5', primaryLight: '#E6F2FA', primaryDark: '#0E4D75' },
  { name: 'Ambra',     primary: '#B8860B', primaryLight: '#FFF6E0', primaryDark: '#8B6508' },
  { name: 'Vulcano',   primary: '#C0392B', primaryLight: '#FDECEA', primaryDark: '#922B21' },
  { name: 'Grafite',   primary: '#4A5568', primaryLight: '#EDF2F7', primaryDark: '#2D3748' },
  { name: 'Viola',     primary: '#7C3AED', primaryLight: '#F0EAFF', primaryDark: '#5B21B6' },
]

// ── Default ─────────────────────────────────────────────────
export const DEFAULT_ACCENT = ACCENT_PRESETS[0]
export const DEFAULT_MODE = 'dark'

// ── Generatore tema ─────────────────────────────────────────
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
      '--color-success': '#66BB6A',
      '--color-success-glow': 'rgba(102, 187, 106, 0.12)',
      '--color-warning': '#FFB74D',
      '--color-warning-glow': 'rgba(255, 183, 77, 0.12)',
      '--color-danger': '#EF5350',
      '--color-danger-glow': 'rgba(239, 83, 80, 0.12)',
      '--color-critical': '#dc2626',
      '--color-info': '#64B5F6',

      // Surfaces
      '--color-bg': '#111318',
      '--color-bg-subtle': '#151920',
      '--color-surface-0': '#1A1D23',
      '--color-surface-1': '#22262E',
      '--color-surface-2': '#2A2F38',
      '--color-surface-3': '#323842',
      '--color-surface-elevated': 'rgba(34, 38, 46, 0.85)',

      // Borders
      '--color-border': '#2E3440',
      '--color-border-subtle': 'rgba(255, 255, 255, 0.04)',
      '--color-border-hover': 'rgba(255, 255, 255, 0.12)',
      '--color-border-active': `${a.primary}50`,

      // Text
      '--color-text': '#E8ECF2',
      '--color-text-secondary': '#8E99A8',
      '--color-text-muted': '#5F6B7A',
      '--color-text-faint': '#475569',

      // Shadows
      '--shadow-xs': '0 1px 2px rgba(0, 0, 0, 0.3)',
      '--shadow-sm': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.4)',
      '--shadow-md': '0 3px 8px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 6px 16px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.3)',
      '--shadow-xl': '0 10px 32px rgba(0,0,0,0.5), 0 6px 12px rgba(0,0,0,0.35)',
      '--shadow-glow-primary': `0 0 20px ${a.primary}20, 0 0 60px ${a.primary}08`,

      // Glass
      '--glass-bg': 'rgba(26, 29, 35, 0.88)',
      '--glass-bg-heavy': 'rgba(17, 19, 24, 0.92)',
      '--glass-blur': '16px',
      '--glass-blur-heavy': '24px',
      '--glass-border': 'rgba(255, 255, 255, 0.06)',

      // Gradients
      '--gradient-surface': 'linear-gradient(145deg, #22262E 0%, #1A1D23 100%)',
      '--gradient-card': 'linear-gradient(160deg, rgba(42, 47, 56, 0.5) 0%, rgba(26, 29, 35, 0.3) 100%)',
      '--gradient-primary': `linear-gradient(135deg, ${a.primary} 0%, ${a.primaryDark} 100%)`,

      // Header
      '--header-bg': `linear-gradient(135deg, ${a.primary}, ${a.primaryDark})`,
      '--header-text': '#ffffff',

      // Meta
      '--theme-color': '#111318',
    }
  }

  // ── Light Mode ──────────────────────────────────────────
  return {
    '--color-primary': a.primary,
    '--color-primary-light': a.primaryLight,
    '--color-primary-dark': a.primaryDark,
    '--color-primary-glow': `${a.primary}15`,

    '--color-success': '#10B981',
    '--color-success-glow': 'rgba(16, 185, 129, 0.10)',
    '--color-warning': '#F59E0B',
    '--color-warning-glow': 'rgba(245, 158, 11, 0.10)',
    '--color-danger': '#DC3545',
    '--color-danger-glow': 'rgba(220, 53, 69, 0.10)',
    '--color-critical': '#dc2626',
    '--color-info': '#3B82F6',

    '--color-bg': '#F0F2F5',
    '--color-bg-subtle': '#F5F6F8',
    '--color-surface-0': '#FAFBFC',
    '--color-surface-1': '#FFFFFF',
    '--color-surface-2': '#F5F6F8',
    '--color-surface-3': '#EDF0F3',
    '--color-surface-elevated': 'rgba(255, 255, 255, 0.92)',

    '--color-border': '#E3E7ED',
    '--color-border-subtle': 'rgba(0, 0, 0, 0.04)',
    '--color-border-hover': 'rgba(0, 0, 0, 0.12)',
    '--color-border-active': `${a.primary}40`,

    '--color-text': '#1A1D21',
    '--color-text-secondary': '#5F6B7A',
    '--color-text-muted': '#8E99A8',
    '--color-text-faint': '#A0AEC0',

    '--shadow-xs': '0 1px 2px rgba(0, 0, 0, 0.04)',
    '--shadow-sm': '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
    '--shadow-md': '0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.08)',
    '--shadow-lg': '0 4px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.10)',
    '--shadow-xl': '0 8px 16px rgba(0,0,0,0.06), 0 16px 48px rgba(0,0,0,0.12)',
    '--shadow-glow-primary': `0 0 20px ${a.primary}10, 0 0 60px ${a.primary}05`,

    '--glass-bg': 'rgba(255, 255, 255, 0.88)',
    '--glass-bg-heavy': 'rgba(255, 255, 255, 0.95)',
    '--glass-blur': '16px',
    '--glass-blur-heavy': '24px',
    '--glass-border': 'rgba(0, 0, 0, 0.06)',

    '--gradient-surface': 'linear-gradient(145deg, #FFFFFF 0%, #FAFBFC 100%)',
    '--gradient-card': 'linear-gradient(160deg, rgba(255, 255, 255, 0.8) 0%, rgba(250, 251, 252, 0.4) 100%)',
    '--gradient-primary': `linear-gradient(135deg, ${a.primary} 0%, ${a.primaryDark} 100%)`,

    '--header-bg': `linear-gradient(135deg, ${a.primary}, ${a.primaryDark})`,
    '--header-text': '#ffffff',

    '--theme-color': a.primary,
  }
}

// ── Applica tema al DOM ─────────────────────────────────────
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

// ── Persistenza localStorage ────────────────────────────────
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

// ── Resolve "auto" mode ─────────────────────────────────────
export function resolveMode(mode) {
  if (mode === 'auto') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

// ── Utility: lighten hex color ──────────────────────────────
function lightenHex(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + Math.round(255 * amount))
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * amount))
  const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * amount))
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
}

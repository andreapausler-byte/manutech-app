/**
 * ThemeContext — Sprint Design 0
 * 
 * Gestisce dark/light/auto + accent color.
 * Inietta CSS variables in :root ad ogni cambio.
 * Persiste le preferenze in localStorage.
 * Ascolta prefers-color-scheme per modalità "auto".
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  makeTheme,
  applyTheme,
  saveThemePrefs,
  loadThemePrefs,
  resolveMode,
} from '../lib/theme'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  // Carica preferenze salvate o usa default
  const saved = useMemo(() => loadThemePrefs(), [])
  const [mode, setModeState] = useState(saved?.mode || DEFAULT_MODE)
  const [accent, setAccentState] = useState(saved?.accent || DEFAULT_ACCENT)

  // Risolvi "auto" → "dark" o "light"
  const resolved = resolveMode(mode)

  // Genera e applica il tema
  useEffect(() => {
    const themeVars = makeTheme(resolved, accent)
    applyTheme(themeVars)
  }, [resolved, accent])

  // Salva preferenze quando cambiano
  useEffect(() => {
    saveThemePrefs(mode, accent.name)
  }, [mode, accent])

  // Ascolta cambio preferenze di sistema (per modalità "auto")
  useEffect(() => {
    if (mode !== 'auto') return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const themeVars = makeTheme(resolveMode('auto'), accent)
      applyTheme(themeVars)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [mode, accent])

  const setMode = useCallback((newMode) => {
    setModeState(newMode)
  }, [])

  const setAccent = useCallback((newAccent) => {
    setAccentState(newAccent)
  }, [])

  const toggleMode = useCallback(() => {
    setModeState(prev => {
      const current = resolveMode(prev)
      return current === 'dark' ? 'light' : 'dark'
    })
  }, [])

  const value = useMemo(() => ({
    mode,           // 'dark' | 'light' | 'auto'
    resolved,       // 'dark' | 'light' (risolto)
    accent,         // { name, primary, primaryLight, primaryDark }
    setMode,
    setAccent,
    toggleMode,
    isDark: resolved === 'dark',
    isLight: resolved === 'light',
    presets: ACCENT_PRESETS,
  }), [mode, resolved, accent, setMode, setAccent, toggleMode])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider')
  return ctx
}

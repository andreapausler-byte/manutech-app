/**
 * useAIPower — preferenza "Potenza AI" dell'admin, persistita in localStorage.
 *
 * Mappa il vocabolario user-facing (veloce/equilibrato/approfondito) che il
 * resolver server-side (`supabase/functions/_shared/models.ts`) traduce nel
 * modello concreto:
 *   veloce → Haiku · equilibrato → Sonnet 4.6 · approfondito → Opus 4.8.
 *
 * Pensato per la sola admin desktop (power-user). Il tecnico mobile resta sul
 * default server senza selettore — ADR-010 anti-pattern #8: niente attrito in
 * fabbrica. Vedi docs/decisions/ADR-010 → "Politica modelli".
 *
 * Stesso pattern localStorage usato in AdminCalendar (showCancelled).
 */

import { useCallback, useEffect, useState } from 'react'

export const AI_POWER_LEVELS = ['veloce', 'equilibrato', 'approfondito']
export const DEFAULT_AI_POWER = 'equilibrato'
const STORAGE_KEY = 'manutech_admin_ai_power'

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return AI_POWER_LEVELS.includes(v) ? v : DEFAULT_AI_POWER
  } catch {
    return DEFAULT_AI_POWER
  }
}

export function useAIPower() {
  const [power, setPowerState] = useState(readStored)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, power) }
    catch { /* storage non disponibile */ }
  }, [power])

  const setPower = useCallback((next) => {
    if (AI_POWER_LEVELS.includes(next)) setPowerState(next)
  }, [])

  return { power, setPower }
}

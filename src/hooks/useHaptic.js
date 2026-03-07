/**
 * useHaptic — Feedback aptico (vibrazione) per azioni su mobile
 * 
 * Patterns:
 *   light   → tap su bottone, selezione filtro (10ms)
 *   medium  → azione completata, invio commento (25ms)  
 *   success → report creato, stato aggiornato (pattern doppio)
 *   error   → errore, azione fallita (pattern lungo)
 *   warning → conferma pericolosa, cancellazione (pattern triplo)
 */

const PATTERNS = {
  light:   [10],
  medium:  [25],
  success: [15, 80, 25],      // tap - pausa - tap forte
  error:   [50, 30, 50],      // buzz - pausa - buzz
  warning: [10, 50, 10, 50, 30], // rapido triplo
}

function canVibrate() {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator
}

export function useHaptic() {
  const vibrate = (pattern = 'medium') => {
    if (!canVibrate()) return false

    const p = PATTERNS[pattern] || PATTERNS.medium

    try {
      navigator.vibrate(p)
      return true
    } catch {
      return false
    }
  }

  return {
    vibrate,
    light:   () => vibrate('light'),
    medium:  () => vibrate('medium'),
    success: () => vibrate('success'),
    error:   () => vibrate('error'),
    warning: () => vibrate('warning'),
  }
}

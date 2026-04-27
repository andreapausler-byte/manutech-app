/**
 * useToast — Toast notifications con feedback aptico integrato
 * 
 * Uso: const toast = useToast()
 *      toast.success('Report inviato!')
 *      toast.error('Errore di connessione')
 *      toast.info('Bozza salvata')
 */

import hotToast from 'react-hot-toast'
import { useHaptic } from './useHaptic'

export function useToast() {
  const haptic = useHaptic()

  const success = (message, options = {}) => {
    haptic.success()
    return hotToast.success(message, {
      duration: 2500,
      ...options,
    })
  }

  const error = (message, options = {}) => {
    haptic.error()
    return hotToast.error(message, {
      duration: 4000,
      ...options,
    })
  }

  const info = (message, options = {}) => {
    haptic.light()
    return hotToast(message, {
      duration: 2000,
      icon: 'ℹ️',
      ...options,
    })
  }

  const warning = (message, options = {}) => {
    haptic.warning()
    return hotToast(message, {
      duration: 3000,
      icon: '⚠️',
      ...options,
    })
  }

  const loading = (message, options = {}) => {
    return hotToast.loading(message, {
      ...options,
    })
  }

  // Promise-based toast (per async operations)
  const promise = (promiseFn, messages = {}) => {
    return hotToast.promise(promiseFn, {
      loading: messages.loading || 'Caricamento...',
      success: () => {
        haptic.success()
        return messages.success || 'Fatto!'
      },
      error: (err) => {
        haptic.error()
        return messages.error || err?.message || 'Errore'
      },
    })
  }

  const dismiss = (id) => hotToast.dismiss(id)

  return { success, error, info, warning, loading, promise, dismiss }
}

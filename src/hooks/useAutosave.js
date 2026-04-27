/**
 * useAutosave — Salvataggio automatico bozze su localStorage
 * 
 * Salva i dati del form ogni 5 secondi (solo se ci sono modifiche).
 * Al mount, ripristina la bozza se presente.
 * Dopo invio riuscito, cancella la bozza con clearDraft().
 */

import { useEffect, useRef, useCallback, useState } from 'react'

const AUTOSAVE_INTERVAL = 5000
const STORAGE_PREFIX = 'manutech_draft_'

export function useAutosave(key, data, setData) {
  const [hasDraft, setHasDraft] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const prevDataRef = useRef(null)
  const storageKey = STORAGE_PREFIX + key

  // Ripristina bozza al mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed._savedAt && Date.now() - parsed._savedAt < 86400000) {
          const { _savedAt, ...formData } = parsed
          setData(prev => ({ ...prev, ...formData }))
          setHasDraft(true)
          setLastSaved(new Date(_savedAt))
        } else {
          localStorage.removeItem(storageKey)
        }
      }
    } catch { /* ignore localStorage errors */ }
  }, [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Salvataggio periodico
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const currentJson = JSON.stringify(data)
        const prevJson = JSON.stringify(prevDataRef.current)

        const hasContent = Object.values(data).some(v =>
          typeof v === 'string' ? v.trim().length > 0 : !!v
        )

        if (hasContent && currentJson !== prevJson) {
          const toSave = { ...data, _savedAt: Date.now() }
          localStorage.setItem(storageKey, JSON.stringify(toSave))
          prevDataRef.current = { ...data }
          setHasDraft(true)
          setLastSaved(new Date())
        }
      } catch { /* ignore localStorage errors */ }
    }, AUTOSAVE_INTERVAL)

    return () => clearInterval(timer)
  }, [data, storageKey])

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
      setHasDraft(false)
      setLastSaved(null)
      prevDataRef.current = null
    } catch { /* ignore localStorage errors */ }
  }, [storageKey])

  const discardDraft = useCallback((defaultData) => {
    clearDraft()
    if (defaultData) setData(defaultData)
  }, [clearDraft, setData])

  return { hasDraft, lastSaved, clearDraft, discardDraft }
}

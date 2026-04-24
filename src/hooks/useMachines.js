import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'

// Restituisce le macchine attive dell'organizzazione, ordinate per nome.
// Wrapper su db.getMachines() (che gestisce già Supabase + fallback localStorage).
export function useMachines() {
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    db.getMachines()
      .then(list => {
        if (cancelled) return
        const active = (list || []).filter(m => !m.status || m.status === 'attivo')
        active.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        setMachines(active)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { machines, loading, error }
}

export default useMachines

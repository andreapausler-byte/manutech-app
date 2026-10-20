import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../lib/supabase'

// Dati della mappa impianto: macchine (con `map_position`), aree, ticket,
// piani e ultima esecuzione di ogni piano. Si ricaricano a richiesta e
// quando si torna sull'app dopo almeno un minuto: il tecnico che riapre il
// telefono vede i ticket di adesso, non quelli di stamattina.
export function usePlantMapData(user) {
  const [data, setData] = useState({ machines: [], areas: [], reports: [], plans: [], lastLogs: {} })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadedAt, setLoadedAt] = useState(null)
  const [error, setError] = useState(null)
  const loadedAtRef = useRef(0)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [machines, areas, reports, plans, lastLogs] = await Promise.all([
        db.getMachines(),
        db.getAreas().catch(() => []),
        db.getReports(),
        db.getAllMaintenancePlans().catch(() => []),
        db.getLastLogPerPlan().catch(() => ({})),
      ])
      setData({ machines: machines || [], areas: areas || [], reports: reports || [], plans: plans || [], lastLogs: lastLogs || {} })
      const now = new Date()
      setLoadedAt(now)
      loadedAtRef.current = now.getTime()
      setError(null)
    } catch (e) {
      console.warn('[usePlantMapData] load failed', e)
      setError(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAtRef.current > 60_000) load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // Sposta (point = [x, y] mm) o conferma (point = null) il punto di una
  // macchina; la riga in memoria si aggiorna con quello che torna dal server.
  const savePosition = useCallback(async (machineId, point) => {
    const pos = await db.setMachineMapPosition(machineId, point, user)
    setData(d => ({ ...d, machines: d.machines.map(m => (m.id === machineId ? { ...m, map_position: pos } : m)) }))
    return pos
  }, [user])

  return { ...data, loading, refreshing, loadedAt, error, reload: load, savePosition }
}

export default usePlantMapData

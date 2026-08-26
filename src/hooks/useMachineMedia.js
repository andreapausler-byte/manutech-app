/**
 * useMachineMedia — Galleria foto e video di un macchinario
 *
 * Unisce i media che nel tempo si sono depositati su segnalazioni, chat,
 * log di manutenzione e interventi della stessa macchina, e li incrocia
 * con la galleria curata (machines.attachments categoria 'foto') per
 * sapere quali sono "in evidenza".
 *
 * Uso:
 *   const { items, featured, attachments, loading, hasMore, loadMore,
 *           toggleFeature, applyAttachments } = useMachineMedia(machine)
 *
 * `applyAttachments(list)` serve a chi scrive negli attachments per
 * altre vie (un upload dal campo): passa la lista fresca e la scheda si
 * aggiorna senza rileggere la macchina.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../lib/supabase'

const PAGE_SIZE = 60
const EMPTY = []

export function useMachineMedia(machine) {
  const machineId = machine?.id
  const machineName = machine?.name
  const machineAttachments = machine?.attachments

  // Il feed porta con sé la macchina di cui è il feed: finché non coincide
  // con quella richiesta stiamo caricando. Così non serve rispecchiare lo
  // stato di caricamento con una setState dentro l'effect.
  const [feed, setFeed] = useState({ machineId: null, items: EMPTY, hasMore: false })
  const [loadingMore, setLoadingMore] = useState(false)

  // Dopo un toggle la versione fresca della galleria curata è quella che
  // ci ha ritornato la RPC, non la prop: la teniamo qui finché resta la
  // stessa macchina.
  const [override, setOverride] = useState(null)   // { machineId, list }

  const ready = feed.machineId === machineId
  const loading = !!machineId && !ready
  const rawItems = ready ? feed.items : EMPTY
  const hasMore = ready && feed.hasMore

  useEffect(() => {
    if (!machineId) return undefined
    let cancelled = false
    db.getMachineMedia(machineId, { limit: PAGE_SIZE, machineName })
      .then(list => {
        if (cancelled) return
        setFeed({ machineId, items: list, hasMore: list.length === PAGE_SIZE })
      })
      .catch(err => {
        if (cancelled) return
        console.warn('[useMachineMedia] load failed:', err.message)
        setFeed({ machineId, items: EMPTY, hasMore: false })
      })
    return () => { cancelled = true }
  }, [machineId, machineName])

  const loadMore = useCallback(async () => {
    if (!machineId || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const next = await db.getMachineMedia(machineId, {
        limit: PAGE_SIZE, offset: rawItems.length, machineName,
      })
      setFeed(prev => ({
        machineId,
        items: [...prev.items, ...next],
        hasMore: next.length === PAGE_SIZE,
      }))
    } catch (err) {
      console.warn('[useMachineMedia] loadMore failed:', err.message)
      setFeed(prev => ({ ...prev, hasMore: false }))
    }
    setLoadingMore(false)
  }, [machineId, machineName, rawItems.length, loadingMore, hasMore])

  // `override &&` non è ridondante: senza macchina entrambi gli id sono
  // undefined, `override?.machineId === machineId` risulterebbe vero e
  // finiremmo a leggere `.list` su null.
  const attachments = useMemo(
    () => (override && override.machineId === machineId ? override.list : (machineAttachments || EMPTY)),
    [override, machineId, machineAttachments]
  )

  // URL già promossi nella galleria curata: è così che marchiamo
  // "in evidenza" senza duplicare stato.
  const featuredUrls = useMemo(
    () => new Set(attachments.map(a => a.url).filter(Boolean)),
    [attachments]
  )

  // La galleria curata può contenere foto che nel feed non compaiono:
  // caricate a mano dall'ufficio, o scattate dal campo con il tasto
  // Scatta. Le anteponiamo così la vista "In evidenza" è completa, e
  // teniamo distinte le due provenienze — chi guarda la foto vuole
  // sapere se l'ha scattata qualcuno davanti alla macchina.
  const items = useMemo(() => {
    const feedUrls = new Set(rawItems.map(i => i.url))
    const manual = attachments
      .filter(a => a.url && !feedUrls.has(a.url) && (a.type === 'image' || a.type === 'video'))
      .map(a => ({
        url: a.url,
        thumb_url: a.thumb_url || null,
        type: a.type === 'video' ? 'video' : 'photo',
        name: a.name || null,
        taken_at: a.uploaded_at || null,
        // Una foto archiviata sotto un componente resta una foto della
        // macchina — compare in galleria come tutte le altre — ma dice di
        // che pezzo è: è l'unica etichetta che serve a chi la guarda.
        source: a.component_id ? 'componente' : (a.uploaded_from === 'campo' ? 'campo' : 'scheda'),
        source_id: a.component_id || null,
        source_label: a.component_name
          || (a.uploaded_from === 'campo' ? 'Scattata dal campo' : 'Scheda macchina'),
        component_id: a.component_id || null,
        component_name: a.component_name || null,
        author_name: a.uploaded_by_name || null,
      }))
    return [...rawItems, ...manual]
      .map(i => ({ ...i, is_featured: featuredUrls.has(i.url) }))
      .sort((a, b) => new Date(b.taken_at || 0) - new Date(a.taken_at || 0))
  }, [rawItems, attachments, featuredUrls])

  const featured = useMemo(() => items.filter(i => i.is_featured), [items])

  const applyAttachments = useCallback((list) => {
    setOverride({ machineId, list: list || [] })
  }, [machineId])

  const toggleFeature = useCallback(async (item) => {
    const next = await db.toggleMachineMediaFeature(machineId, item)
    applyAttachments(next)
    return next
  }, [machineId, applyAttachments])

  return {
    items, featured, attachments, loading, loadingMore, hasMore,
    loadMore, toggleFeature, applyAttachments,
  }
}

export default useMachineMedia

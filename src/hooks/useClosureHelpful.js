/**
 * useClosureHelpful — "Mi è servita" su una chiusura.
 *
 * Un voto per collega (reazione 'servito', migration 064). Chi vota dice
 * a chi ha chiuso che il suo racconto gli ha fatto risparmiare tempo; il
 * tecnico della chiusura riceve 5 ManuCoin la prima volta che un collega
 * vota (lo accredita il trigger, non il client).
 *
 * Votano tecnici e admin — sono loro a leggere le chiusure per lavorarci —
 * e mai sulla propria chiusura.
 *
 * Uso:
 *   const { votes, mine, canVote, isCloser, busy, toggle } = useClosureHelpful(report, user)
 */
import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { useToast } from './useToast'
import { useHaptic } from './useHaptic'

const isHelpfulVote = (r) => r.type === 'servito' && !r.comment_id

export function useClosureHelpful(report, user) {
  const toast = useToast()
  const haptic = useHaptic()
  const [votes, setVotes] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    db.getReactions(report.id)
      .then(list => { if (!cancelled) setVotes((list || []).filter(isHelpfulVote)) })
      .catch(e => console.warn('[useClosureHelpful] getReactions failed:', e?.message))
    return () => { cancelled = true }
  }, [report.id])

  const mine = votes.find(v => v.user_id === user?.id) || null
  const isCloser = !!report.assigned_to && report.assigned_to === user?.id
  const canVote = ['tecnico', 'admin', 'super_admin'].includes(user?.role) && !isCloser

  const toggle = useCallback(async () => {
    if (busy || !canVote) return
    setBusy(true)
    haptic.light()
    try {
      if (mine) {
        await db.removeReaction(mine.id)
        setVotes(v => v.filter(x => x.id !== mine.id))
      } else {
        const created = await db.markClosureHelpful(report, user)
        setVotes(v => [...v, created])
        haptic.success()
        toast.success(report.assigned_to_name
          ? `Grazie! ${report.assigned_to_name.split(' ')[0]} lo saprà`
          : 'Grazie per il riscontro')
      }
    } catch (err) {
      console.error('[useClosureHelpful] toggle failed:', err)
      toast.error(`Non riuscito: ${err?.message || 'riprova'}`)
    } finally {
      setBusy(false)
    }
  }, [busy, canVote, mine, report, user, haptic, toast])

  return { votes, mine, canVote, isCloser, busy, toggle }
}

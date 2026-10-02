/**
 * useWallet — Hook per gestione wallet ManuCoin
 *
 * Fornisce saldo, transazioni, catalogo premi e azioni di riscatto.
 * Auto-accredita token per i traguardi del mese (badge e livelli).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../lib/supabase'
import { LEVELS } from './useOperatorScore'

// ManuCoin per evento. badge_unlock e level_up li accetta credit_tokens
// (migration 067) solo con questi importi; closure_helpful lo accredita il
// trigger della 064. Cambiarli vuol dire cambiare anche lì.
export const TOKEN_REWARDS = {
  badge_unlock: 5,      // Ogni badge tenuto nel mese
  level_up: 20,         // Ogni livello raggiunto nel mese, da Argento in su
  closure_helpful: 5,   // "Mi è servita": a chi ha chiuso, una volta per collega
}

const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

// "2026-10": il mese di calendario che una chiave di accredito porta con sé.
export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function useWallet(userId) {
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [config, setConfig] = useState({ token_name: 'ManuCoin', token_symbol: 'MC', token_value_eur: 0.50 })
  const [rewards, setRewards] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      const [bal, txs, cfg, rwd, red] = await Promise.all([
        db.getTokenBalance(userId),
        db.getTokenTransactions(userId, 50),
        db.getTokenConfig(),
        db.getRewardCatalog(),
        db.getRedemptions(userId),
      ])
      setBalance(bal)
      setTransactions(txs)
      setConfig(cfg)
      setRewards(rwd)
      setRedemptions(red)
    } catch (e) {
      console.warn('[useWallet] Load error:', e.message)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  const refresh = useCallback(() => loadData(), [loadData])

  const redeem = useCallback(async (rewardId, user) => {
    const result = await db.redeemReward(rewardId, user)
    await loadData()
    return result
  }, [loadData])

  return {
    balance,
    transactions,
    config,
    rewards,
    redemptions,
    loading,
    refresh,
    redeem,
  }
}

/**
 * useAutoTokenReward — Accredita i traguardi del mese
 * Va usato nel componente che calcola i punteggi (MobileDashboard)
 *
 * Badge e livello sono quelli che l'operatore vede in Home (ultimi 30 giorni)
 * e pagano una volta per mese di calendario: la chiave porta il mese
 * (badge_reports_10:2026-10). Il server (credit_tokens, migration 067) accetta
 * solo il mese corrente e non paga due volte la stessa chiave, quindi un
 * secondo telefono non raddoppia. Il localStorage evita solo chiamate inutili.
 */
export function useAutoTokenReward(userId, badges, level) {
  const credited = useRef(new Set())

  useEffect(() => {
    if (!userId || !badges) return
    const month = monthKey()
    const monthLabel = MONTHS_IT[new Date().getMonth()]
    const storageKey = `manutech_credited_${userId}`
    const readCredited = () => JSON.parse(localStorage.getItem(storageKey) || '[]')

    const creditIfNew = async (key, amount, reason, reasonCode) => {
      if (credited.current.has(key)) return
      credited.current.add(key)
      if (readCredited().includes(key)) return
      try {
        await db.creditTokens(userId, amount, reason, reasonCode, key, 'earn')
        // Riletto dopo l'await (gli accrediti partono in parallelo); le
        // chiavi dei mesi passati non servono più.
        const keep = readCredited().filter(k => k.endsWith(`:${month}`))
        localStorage.setItem(storageKey, JSON.stringify([...keep, key]))
      } catch (e) {
        credited.current.delete(key)
        console.warn('[AutoToken] Credit failed:', e.message)
      }
    }

    badges.forEach(badge => {
      creditIfNew(
        `badge_${badge.id}:${month}`,
        TOKEN_REWARDS.badge_unlock,
        `Traguardo di ${monthLabel}: ${badge.icon} ${badge.label}`,
        'badge_unlock'
      )
    })

    // Ogni livello raggiunto, non solo l'ultimo: chi passa da Bronzo a Oro
    // tra due aperture dell'app prende anche Argento.
    const levelIdx = LEVELS.findIndex(l => l.id === level?.id)
    LEVELS.slice(1, levelIdx + 1).forEach(l => {
      creditIfNew(
        `level_${l.id}:${month}`,
        TOKEN_REWARDS.level_up,
        `Livello di ${monthLabel}: ${l.icon} ${l.label}`,
        'level_up'
      )
    })
  }, [userId, badges, level])
}

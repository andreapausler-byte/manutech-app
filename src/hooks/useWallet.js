/**
 * useWallet — Hook per gestione wallet ManuCoin
 *
 * Fornisce saldo, transazioni, catalogo premi e azioni di riscatto.
 * Auto-accredita token per badge sbloccati e level-up.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../lib/supabase'

// Token guadagnati per evento
export const TOKEN_REWARDS = {
  badge_unlock: 5,      // Per ogni badge sbloccato
  level_up: 20,         // Per ogni livello raggiunto
  streak_7: 10,         // Bonus 7 giorni streak
  streak_30: 50,        // Bonus 30 giorni streak
  first_report: 3,      // Primo report
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

  const redeem = useCallback(async (rewardId) => {
    const result = await db.redeemReward(rewardId)
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
 * useAutoTokenReward — Accredita automaticamente token per badge/livelli
 * Va usato nel componente che calcola i punteggi (MobileDashboard)
 */
export function useAutoTokenReward(userId, badges, level) {
  const credited = useRef(new Set())

  useEffect(() => {
    if (!userId || !badges) return

    const creditIfNew = async (key, amount, reason, reasonCode) => {
      if (credited.current.has(key)) return
      // Controlla localStorage per evitare duplicati tra sessioni
      const storageKey = `manutech_credited_${userId}`
      const already = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (already.includes(key)) {
        credited.current.add(key)
        return
      }
      try {
        await db.creditTokens(userId, amount, reason, reasonCode, key, 'earn')
        already.push(key)
        localStorage.setItem(storageKey, JSON.stringify(already))
        credited.current.add(key)
      } catch (e) {
        console.warn('[AutoToken] Credit failed:', e.message)
      }
    }

    // Accredita per ogni badge sbloccato
    badges.forEach(badge => {
      creditIfNew(
        `badge_${badge.id}`,
        TOKEN_REWARDS.badge_unlock,
        `Badge sbloccato: ${badge.icon} ${badge.label}`,
        'badge_unlock'
      )
    })

    // Accredita per livello
    if (level?.id && level.id !== 'bronzo') {
      creditIfNew(
        `level_${level.id}`,
        TOKEN_REWARDS.level_up,
        `Livello raggiunto: ${level.icon} ${level.label}`,
        'level_up'
      )
    }
  }, [userId, badges, level])
}

import { supabase, getMyOrgId } from './_client'
import { getStore, setStore } from './_demoStore'

const DEFAULT_TOKEN_CONFIG = { token_name: 'ManuCoin', token_symbol: 'MC', token_value_eur: 0.50 }

// Chiavi demo (localStorage)
const TX_KEY = 'manutech_token_tx'
const REWARDS_KEY = 'manutech_rewards'
const REDEMPTIONS_KEY = 'manutech_redemptions'

const isCredit = (type) => ['earn', 'bonus', 'refund'].includes(type)
const demoBalance = (txs, userId) => txs.filter(t => t.user_id === userId)
  .reduce((bal, t) => bal + (isCredit(t.type) ? t.amount : -t.amount), 0)

// Le funzioni dei premi arrivano con la migration 067: senza, PostgREST
// risponde PGRST202 (funzione inesistente) con un messaggio in inglese.
function rpcError(error) {
  if (error?.code === 'PGRST202') {
    return new Error("Manca un aggiornamento del database (migration 067): avvisa l'amministratore")
  }
  return error
}

export const wallet = {
  async getTokenConfig() {
    if (supabase) {
      const { data } = await supabase.from('token_config').select('*').single()
      return data || DEFAULT_TOKEN_CONFIG
    }
    return { ...DEFAULT_TOKEN_CONFIG, ...JSON.parse(localStorage.getItem('manutech_token_config') || '{}') }
  },

  async saveTokenConfig(config) {
    if (supabase) {
      const orgId = await getMyOrgId()
      const { data, error } = await supabase
        .from('token_config')
        .upsert({ ...config, org_id: orgId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
        .select().single()
      if (error) throw error
      return data
    }
    localStorage.setItem('manutech_token_config', JSON.stringify(config))
    return config
  },

  async getTokenBalance(userId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('get_token_balance', { _user_id: userId || null })
      if (error) return 0
      return data || 0
    }
    return demoBalance(getStore(TX_KEY), userId)
  },

  async getTokenTransactions(userId, limit = 50) {
    if (supabase) {
      let query = supabase.from('token_transactions').select('*').order('created_at', { ascending: false }).limit(limit)
      if (userId) query = query.eq('user_id', userId)
      const { data } = await query
      return data || []
    }
    const txs = getStore(TX_KEY)
    return userId ? txs.filter(t => t.user_id === userId).slice(0, limit) : txs.slice(0, limit)
  },

  // Saldo di ogni persona e quanto ha guadagnato nel mese (solo admin):
  // { [userId]: { balance, earned_month } }
  async getOrgBalances() {
    if (supabase) {
      const { data, error } = await supabase.rpc('get_org_token_balances')
      if (error) throw rpcError(error)
      return Object.fromEntries((data || []).map(r => [r.user_id, { balance: r.balance, earned_month: r.earned_month }]))
    }
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const out = {}
    for (const t of getStore(TX_KEY)) {
      const row = out[t.user_id] || (out[t.user_id] = { balance: 0, earned_month: 0 })
      row.balance += isCredit(t.type) ? t.amount : -t.amount
      if ((t.type === 'earn' || t.type === 'bonus') && new Date(t.created_at) >= monthStart) row.earned_month += t.amount
    }
    return out
  },

  // In supabase le regole le applica credit_tokens (migration 067): chi non è
  // admin accredita solo sé stesso e solo i traguardi del mese; la stessa
  // chiave (reasonCode + referenceId) non paga due volte.
  async creditTokens(userId, amount, reason, reasonCode = null, referenceId = null, type = 'earn') {
    if (supabase) {
      const { data, error } = await supabase.rpc('credit_tokens', {
        _user_id: userId, _amount: amount, _reason: reason,
        _reason_code: reasonCode, _reference_id: referenceId, _type: type,
      })
      if (error) throw error
      return data
    }
    const txs = getStore(TX_KEY)
    if (reasonCode && referenceId) {
      const existing = txs.find(t => t.user_id === userId && t.reason_code === reasonCode && t.reference_id === referenceId)
      if (existing) return existing
    }
    const balance = demoBalance(txs, userId)
    const tx = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, user_id: userId, type, amount, reason,
      reason_code: reasonCode, reference_id: referenceId,
      balance_after: balance + (isCredit(type) ? amount : -amount), created_at: new Date().toISOString(),
    }
    txs.unshift(tx)
    setStore(TX_KEY, txs)
    return tx
  },

  // ── Catalogo premi ──
  async getRewardCatalog() {
    if (supabase) {
      const { data } = await supabase.from('reward_catalog').select('*').eq('active', true).order('cost', { ascending: true })
      return data || []
    }
    return getStore(REWARDS_KEY).filter(r => r.active !== false).sort((a, b) => a.cost - b.cost)
  },

  async getAllRewards() {
    if (supabase) {
      const { data } = await supabase.from('reward_catalog').select('*').order('created_at', { ascending: false })
      return data || []
    }
    return getStore(REWARDS_KEY)
  },

  async createReward(reward) {
    if (supabase) {
      const orgId = await getMyOrgId()
      const { data, error } = await supabase.from('reward_catalog').insert({ ...reward, org_id: orgId }).select().single()
      if (error) throw error
      return data
    }
    const rewards = getStore(REWARDS_KEY)
    const r = { active: true, ...reward, id: `rw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, created_at: new Date().toISOString() }
    rewards.unshift(r)
    setStore(REWARDS_KEY, rewards)
    return r
  },

  async updateReward(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('reward_catalog').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const rewards = getStore(REWARDS_KEY)
    const idx = rewards.findIndex(r => r.id === id)
    if (idx >= 0) { rewards[idx] = { ...rewards[idx], ...updates }; setStore(REWARDS_KEY, rewards) }
    return rewards[idx]
  },

  // Lo storico dei riscatti resta (dalla 067 reward_id diventa NULL).
  async deleteReward(id) {
    if (supabase) {
      const { error } = await supabase.from('reward_catalog').delete().eq('id', id)
      if (error) throw error
      return
    }
    setStore(REWARDS_KEY, getStore(REWARDS_KEY).filter(r => r.id !== id))
    setStore(REDEMPTIONS_KEY, getStore(REDEMPTIONS_KEY).map(r => r.reward_id === id ? { ...r, reward_id: null } : r))
  },

  // In supabase chi riscatta lo decide la sessione; `user` serve alla demo.
  async redeemReward(rewardId, user) {
    if (supabase) {
      const { data, error } = await supabase.rpc('redeem_reward', { _reward_id: rewardId })
      if (error) throw rpcError(error)
      return data
    }
    const rewards = getStore(REWARDS_KEY)
    const reward = rewards.find(r => r.id === rewardId && r.active !== false)
    if (!reward) throw new Error('Premio non disponibile')
    if (reward.stock != null && reward.stock <= 0) throw new Error('Premio esaurito')
    const balance = demoBalance(getStore(TX_KEY), user?.id)
    if (balance < reward.cost) throw new Error(`Saldo insufficiente: ${balance} disponibili, ${reward.cost} richiesti`)
    const now = new Date().toISOString()
    const redemption = {
      id: `red-${Date.now()}`, user_id: user?.id, user_name: user?.name || null,
      reward_id: reward.id, reward_name: reward.name, cost: reward.cost,
      status: 'pending', admin_note: null, created_at: now, updated_at: now,
    }
    setStore(REDEMPTIONS_KEY, [redemption, ...getStore(REDEMPTIONS_KEY)])
    await wallet.creditTokens(user?.id, reward.cost, `Riscatto: ${reward.name}`, 'reward_redeem', redemption.id, 'spend')
    if (reward.stock != null) await wallet.updateReward(reward.id, { stock: reward.stock - 1 })
    return redemption
  },

  async getRedemptions(userId = null) {
    if (supabase) {
      let query = supabase.from('reward_redemptions').select('*').order('created_at', { ascending: false })
      if (userId) query = query.eq('user_id', userId)
      const { data } = await query
      return data || []
    }
    const list = getStore(REDEMPTIONS_KEY)
    return userId ? list.filter(r => r.user_id === userId) : list
  },

  // Admin: pending → approved | rejected, approved → delivered | rejected.
  // Il rifiuto restituisce i ManuCoin e il pezzo allo stock (review_redemption, 067).
  async reviewRedemption(id, status, note = null) {
    if (supabase) {
      const { data, error } = await supabase.rpc('review_redemption', {
        _redemption_id: id, _status: status, _note: note || null,
      })
      if (error) throw rpcError(error)
      return data
    }
    const list = getStore(REDEMPTIONS_KEY)
    const idx = list.findIndex(r => r.id === id)
    if (idx === -1) throw new Error('Riscatto non trovato')
    const red = list[idx]
    const allowed = { pending: ['approved', 'rejected'], approved: ['delivered', 'rejected'] }
    if (!allowed[red.status]?.includes(status)) throw new Error(`Passaggio non consentito: da ${red.status} a ${status}`)
    if (status === 'rejected') {
      await wallet.creditTokens(red.user_id, red.cost, `Rimborso: ${red.reward_name}`, 'reward_refund', red.id, 'refund')
      const reward = getStore(REWARDS_KEY).find(r => r.id === red.reward_id)
      if (reward && reward.stock != null) await wallet.updateReward(reward.id, { stock: reward.stock + 1 })
    }
    list[idx] = { ...red, status, admin_note: note?.trim() || red.admin_note, updated_at: new Date().toISOString() }
    setStore(REDEMPTIONS_KEY, list)
    return list[idx]
  },
}

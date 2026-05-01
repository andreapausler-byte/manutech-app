import { supabase, getMyOrgId } from './_client'

export const wallet = {
  async getTokenConfig() {
    if (supabase) {
      const { data } = await supabase.from('token_config').select('*').single()
      return data || { token_name: 'ManuCoin', token_symbol: 'MC', token_value_eur: 0.50 }
    }
    return JSON.parse(localStorage.getItem('manutech_token_config') || '{}') || { token_name: 'ManuCoin', token_symbol: 'MC', token_value_eur: 0.50 }
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
    const txs = JSON.parse(localStorage.getItem('manutech_token_tx') || '[]')
    return txs.filter(t => t.user_id === userId)
      .reduce((bal, t) => bal + (['earn', 'bonus', 'refund'].includes(t.type) ? t.amount : -t.amount), 0)
  },

  async getTokenTransactions(userId, limit = 50) {
    if (supabase) {
      let query = supabase.from('token_transactions').select('*').order('created_at', { ascending: false }).limit(limit)
      if (userId) query = query.eq('user_id', userId)
      const { data } = await query
      return data || []
    }
    const txs = JSON.parse(localStorage.getItem('manutech_token_tx') || '[]')
    return userId ? txs.filter(t => t.user_id === userId).slice(0, limit) : txs.slice(0, limit)
  },

  async creditTokens(userId, amount, reason, reasonCode = null, referenceId = null, type = 'earn') {
    if (supabase) {
      const { data, error } = await supabase.rpc('credit_tokens', {
        _user_id: userId, _amount: amount, _reason: reason,
        _reason_code: reasonCode, _reference_id: referenceId, _type: type,
      })
      if (error) throw error
      return data
    }
    const txs = JSON.parse(localStorage.getItem('manutech_token_tx') || '[]')
    const balance = txs.filter(t => t.user_id === userId)
      .reduce((bal, t) => bal + (['earn', 'bonus', 'refund'].includes(t.type) ? t.amount : -t.amount), 0)
    const tx = {
      id: `tx-${Date.now()}`, user_id: userId, type, amount, reason,
      reason_code: reasonCode, reference_id: referenceId,
      balance_after: balance + amount, created_at: new Date().toISOString(),
    }
    txs.unshift(tx)
    localStorage.setItem('manutech_token_tx', JSON.stringify(txs))
    return tx
  },

  // ── Catalogo premi ──
  async getRewardCatalog() {
    if (supabase) {
      const { data } = await supabase.from('reward_catalog').select('*').eq('active', true).order('cost', { ascending: true })
      return data || []
    }
    return JSON.parse(localStorage.getItem('manutech_rewards') || '[]').filter(r => r.active !== false)
  },

  async getAllRewards() {
    if (supabase) {
      const { data } = await supabase.from('reward_catalog').select('*').order('created_at', { ascending: false })
      return data || []
    }
    return JSON.parse(localStorage.getItem('manutech_rewards') || '[]')
  },

  async createReward(reward) {
    if (supabase) {
      const orgId = await getMyOrgId()
      const { data, error } = await supabase.from('reward_catalog').insert({ ...reward, org_id: orgId }).select().single()
      if (error) throw error
      return data
    }
    const rewards = JSON.parse(localStorage.getItem('manutech_rewards') || '[]')
    const r = { ...reward, id: `rw-${Date.now()}`, active: true, created_at: new Date().toISOString() }
    rewards.unshift(r)
    localStorage.setItem('manutech_rewards', JSON.stringify(rewards))
    return r
  },

  async updateReward(id, updates) {
    if (supabase) {
      const { data, error } = await supabase.from('reward_catalog').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const rewards = JSON.parse(localStorage.getItem('manutech_rewards') || '[]')
    const idx = rewards.findIndex(r => r.id === id)
    if (idx >= 0) { rewards[idx] = { ...rewards[idx], ...updates }; localStorage.setItem('manutech_rewards', JSON.stringify(rewards)) }
    return rewards[idx]
  },

  async deleteReward(id) {
    if (supabase) {
      await supabase.from('reward_catalog').delete().eq('id', id)
      return
    }
    const rewards = JSON.parse(localStorage.getItem('manutech_rewards') || '[]').filter(r => r.id !== id)
    localStorage.setItem('manutech_rewards', JSON.stringify(rewards))
  },

  async redeemReward(rewardId) {
    if (supabase) {
      const { data, error } = await supabase.rpc('redeem_reward', { _reward_id: rewardId })
      if (error) throw error
      return data
    }
    const rewards = JSON.parse(localStorage.getItem('manutech_rewards') || '[]')
    const reward = rewards.find(r => r.id === rewardId)
    if (!reward) throw new Error('Premio non trovato')
    return { id: `red-${Date.now()}`, reward_name: reward.name, cost: reward.cost, status: 'pending' }
  },

  async getRedemptions(userId = null) {
    if (supabase) {
      let query = supabase.from('reward_redemptions').select('*').order('created_at', { ascending: false })
      if (userId) query = query.eq('user_id', userId)
      const { data } = await query
      return data || []
    }
    return []
  },

  async updateRedemptionStatus(id, status, adminNote = null) {
    if (supabase) {
      const { data, error } = await supabase.from('reward_redemptions')
        .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) throw error
      return data
    }
    return { id, status }
  },
}

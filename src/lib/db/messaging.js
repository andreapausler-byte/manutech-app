import { supabase, DEMO_ORG_ID, getMyOrgId } from './_client'
import { KEYS, getStore } from './_demoStore'

export const messaging = {
  async getConversations(userId) {
    if (supabase) {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, p1:users!conversations_participant_1_fkey(id, name, role, avatar_url), p2:users!conversations_participant_2_fkey(id, name, role, avatar_url)')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
      if (error) { console.warn('[DM] getConversations error:', error.message); return [] }
      return (data || []).map(c => {
        const other = c.p1?.id === userId ? c.p2 : c.p1
        return { ...c, otherUser: other }
      })
    }
    const convs = JSON.parse(localStorage.getItem('manutech_conversations') || '[]')
    const users = getStore(KEYS.users)
    return convs
      .filter(c => c.participant_1 === userId || c.participant_2 === userId)
      .sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at))
      .map(c => {
        const otherId = c.participant_1 === userId ? c.participant_2 : c.participant_1
        const otherUser = users.find(u => u.id === otherId) || { id: otherId, name: 'Utente', role: 'operatore' }
        return { ...c, otherUser }
      })
  },

  async getOrCreateConversation(userId1, userId2, orgId) {
    // Normalize: smaller UUID first
    const [p1, p2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1]

    if (supabase) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('participant_1', p1)
        .eq('participant_2', p2)
        .maybeSingle()
      if (existing) return existing

      const insertOrgId = orgId || await getMyOrgId()
      const { data, error } = await supabase
        .from('conversations')
        .insert({ participant_1: p1, participant_2: p2, org_id: insertOrgId })
        .select()
        .single()
      if (error) {
        console.warn('[DM] getOrCreateConversation insert error:', error.message)
        throw new Error('Impossibile creare la conversazione. Verifica che la migrazione DB sia stata eseguita.')
      }
      return data
    }
    const convs = JSON.parse(localStorage.getItem('manutech_conversations') || '[]')
    let existing = convs.find(c => c.participant_1 === p1 && c.participant_2 === p2)
    if (existing) return existing
    const newConv = {
      id: `conv-${Date.now()}`,
      participant_1: p1,
      participant_2: p2,
      last_message_text: null,
      last_message_at: null,
      last_message_by: null,
      org_id: orgId || DEMO_ORG_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    convs.push(newConv)
    localStorage.setItem('manutech_conversations', JSON.stringify(convs))
    return newConv
  },

  async getDirectMessages(conversationId) {
    if (supabase) {
      const { data, error } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) { console.warn('[DM] getDirectMessages error:', error.message); return [] }
      return data || []
    }
    const msgs = JSON.parse(localStorage.getItem('manutech_direct_messages') || '[]')
    return msgs
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  },

  async sendDirectMessage(conversationId, { senderId, senderName, senderRole, text, media, orgId }) {
    const now = new Date().toISOString()
    if (supabase) {
      const msgOrgId = orgId || await getMyOrgId()
      const { data, error } = await supabase
        .from('direct_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          sender_name: senderName,
          sender_role: senderRole,
          text,
          media: media || null,
          org_id: msgOrgId,
          created_at: now,
        })
        .select()
        .single()
      if (error) throw error

      await supabase
        .from('conversations')
        .update({
          last_message_text: text,
          last_message_at: now,
          last_message_by: senderId,
        })
        .eq('id', conversationId)

      return data
    }
    const msgs = JSON.parse(localStorage.getItem('manutech_direct_messages') || '[]')
    const newMsg = {
      id: `dm-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: senderRole,
      text,
      media: media || null,
      org_id: orgId || DEMO_ORG_ID,
      created_at: now,
    }
    msgs.push(newMsg)
    localStorage.setItem('manutech_direct_messages', JSON.stringify(msgs))

    const convs = JSON.parse(localStorage.getItem('manutech_conversations') || '[]')
    const ci = convs.findIndex(c => c.id === conversationId)
    if (ci !== -1) {
      convs[ci].last_message_text = text
      convs[ci].last_message_at = now
      convs[ci].last_message_by = senderId
      localStorage.setItem('manutech_conversations', JSON.stringify(convs))
    }
    return newMsg
  },

  async getUnreadDMCounts(userId) {
    if (supabase) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      if (!convs?.length) return {}

      const { data: reads } = await supabase
        .from('dm_reads')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId)
      const readsMap = {}
      ;(reads || []).forEach(r => { readsMap[r.conversation_id] = r.last_read_at })

      const counts = {}
      for (const conv of convs) {
        let query = supabase
          .from('direct_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId)
        if (readsMap[conv.id]) {
          query = query.gt('created_at', readsMap[conv.id])
        }
        const { count } = await query
        if (count > 0) counts[conv.id] = count
      }
      return counts
    }
    const msgs = JSON.parse(localStorage.getItem('manutech_direct_messages') || '[]')
    const reads = JSON.parse(localStorage.getItem('manutech_dm_reads') || '{}')
    const convs = JSON.parse(localStorage.getItem('manutech_conversations') || '[]')
    const myConvs = convs.filter(c => c.participant_1 === userId || c.participant_2 === userId)
    const counts = {}
    for (const conv of myConvs) {
      const lastRead = reads[conv.id]
      const unread = msgs.filter(m =>
        m.conversation_id === conv.id &&
        m.sender_id !== userId &&
        (!lastRead || new Date(m.created_at) > new Date(lastRead))
      ).length
      if (unread > 0) counts[conv.id] = unread
    }
    return counts
  },

  async markDMAsRead(conversationId, userId) {
    const now = new Date().toISOString()
    if (supabase) {
      const { error } = await supabase
        .from('dm_reads')
        .upsert(
          { user_id: userId, conversation_id: conversationId, last_read_at: now },
          { onConflict: 'conversation_id,user_id' }
        )
      if (error) throw error
      return
    }
    const reads = JSON.parse(localStorage.getItem('manutech_dm_reads') || '{}')
    reads[conversationId] = now
    localStorage.setItem('manutech_dm_reads', JSON.stringify(reads))
  },
}

/**
 * ConversationList — Lista conversazioni stile WhatsApp
 *
 * Features:
 *  - Lista conversazioni con avatar, nome, ruolo, anteprima ultimo messaggio
 *  - Badge non letti per conversazione
 *  - Barra ricerca
 *  - Bottone nuova conversazione
 *  - Empty state
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { ROLES, timeAgo } from '../../lib/constants'
import { MessageCircle, Plus, Search, Loader } from 'lucide-react'
import NewConversationModal from './NewConversationModal'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default function ConversationList({ user, onSelectConversation, unreadByConversation = {} }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  const loadConversations = async () => {
    try {
      const data = await db.getConversations(user.id)
      setConversations(data)
    } catch (err) {
      console.warn('[ConvList] Errore:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = search.trim()
    ? conversations.filter(c =>
        c.otherUser?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : conversations

  const handleNewConversation = async (otherUser) => {
    setShowNewModal(false)
    try {
      const conv = await db.getOrCreateConversation(user.id, otherUser.id, user.org_id || 'default')
      // Refresh list and open the conversation
      await loadConversations()
      onSelectConversation({ ...conv, otherUser })
    } catch (err) {
      console.warn('[ConvList] Errore creazione conversazione:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader size={28} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>Caricamento...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Messaggi</h2>
        <button
          onClick={() => setShowNewModal(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center press-scale"
          style={{ background: 'var(--gradient-primary)' }}
        >
          <Plus size={20} className="text-white" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca conversazione..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--color-surface-2)' }}
            >
              <MessageCircle size={32} style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
            <div className="text-center">
              <p className="font-semibold" style={{ color: 'var(--color-text-secondary)', fontSize: 15 }}>
                {search ? 'Nessun risultato' : 'Nessuna conversazione'}
              </p>
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginTop: 4 }}>
                {search ? 'Prova con un altro nome' : 'Inizia a chattare con il tuo team'}
              </p>
            </div>
            {!search && (
              <button
                onClick={() => setShowNewModal(true)}
                className="mt-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold press-scale"
                style={{ background: 'var(--gradient-primary)' }}
              >
                Nuova conversazione
              </button>
            )}
          </div>
        ) : (
          filtered.map(conv => {
            const other = conv.otherUser || {}
            const role = ROLES[other.role] || ROLES.operatore
            const unread = unreadByConversation[conv.id] || 0
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left press-scale transition-colors"
                style={{
                  background: unread > 0 ? 'var(--color-surface-2)' : 'transparent',
                }}
              >
                {/* Avatar */}
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white font-bold"
                  style={{
                    background: `linear-gradient(135deg, ${role.color}, ${role.color}99)`,
                    fontSize: 14,
                  }}
                >
                  {getInitials(other.name)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-semibold truncate"
                        style={{
                          color: 'var(--color-text)',
                          fontSize: 14,
                          fontWeight: unread > 0 ? 700 : 600,
                        }}
                      >
                        {other.name || 'Utente'}
                      </span>
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded-md shrink-0"
                        style={{
                          background: `${role.color}22`,
                          color: role.color,
                          fontWeight: 600,
                        }}
                      >
                        {role.label}
                      </span>
                    </div>
                    {conv.last_message_at && (
                      <span
                        className="text-[11px] shrink-0"
                        style={{
                          color: unread > 0 ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                          fontWeight: unread > 0 ? 600 : 400,
                        }}
                      >
                        {timeAgo(conv.last_message_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className="text-[13px] truncate"
                      style={{
                        color: unread > 0 ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                        fontWeight: unread > 0 ? 500 : 400,
                      }}
                    >
                      {conv.last_message_text || 'Nessun messaggio'}
                    </p>
                    {unread > 0 && (
                      <span
                        className="shrink-0 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white px-1.5"
                        style={{ background: 'var(--color-primary)' }}
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* New conversation modal */}
      {showNewModal && (
        <NewConversationModal
          user={user}
          onSelect={handleNewConversation}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  )
}

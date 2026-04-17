/**
 * ConversationList — Premium lista conversazioni
 *
 * Features:
 *  - Staggered entrance animation
 *  - Online status dot con pulse
 *  - Unread highlight con bordo primary
 *  - Search con focus glow
 *  - Empty state con icone animate
 *  - Active conversation highlight (desktop)
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { ROLES, timeAgo } from '../../lib/constants'
import { MessageCircle, Plus, Search, Loader, Sparkles, Send } from 'lucide-react'
import NewConversationModal from './NewConversationModal'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

// Deterministic "online" based on user id (decorative)
function isOnlineish(id) {
  if (!id) return false
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return hash % 3 !== 0 // ~66% online
}

export default function ConversationList({ user, onSelectConversation, unreadByConversation = {}, activeConversationId, openNewChat }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  // Apre modale nuova chat quando richiesto dal FAB esterno
  useEffect(() => {
    if (openNewChat) setShowNewModal(true)
  }, [openNewChat])

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
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Messaggi</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            {conversations.length > 0 ? `${conversations.length} conversazion${conversations.length === 1 ? 'e' : 'i'}` : 'Chat con il team'}
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          aria-label="Nuova conversazione"
          className="w-12 h-12 rounded-2xl flex items-center justify-center press-scale"
          style={{
            background: 'var(--gradient-primary)',
            boxShadow: '0 2px 12px rgba(124, 106, 255, 0.25)',
          }}
        >
          <Plus size={24} className="text-white" />
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
            className="w-full pl-9 pr-3 py-3 rounded-2xl text-base search-chat"
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
          <div className="flex flex-col items-center justify-center py-16 gap-5">
            {/* Animated icon composition */}
            <div className="relative w-20 h-20">
              <div
                className="absolute inset-0 rounded-3xl flex items-center justify-center animate-scale-in"
                style={{ background: 'var(--gradient-primary)', opacity: 0.1 }}
              >
                <MessageCircle size={40} />
              </div>
              <div
                className="absolute -top-2 -right-2 animate-scale-in"
                style={{ animationDelay: '150ms' }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--color-surface-2)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <Send size={14} style={{ color: 'var(--color-primary)' }} />
                </div>
              </div>
              <div
                className="absolute -bottom-1 -left-1 animate-scale-in"
                style={{ animationDelay: '250ms' }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--color-surface-2)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <Sparkles size={12} style={{ color: 'var(--color-primary)' }} />
                </div>
              </div>
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
                className="mt-1 px-5 py-2.5 rounded-2xl text-white text-sm font-semibold press-scale"
                style={{
                  background: 'var(--gradient-primary)',
                  boxShadow: '0 2px 12px rgba(124, 106, 255, 0.25)',
                }}
              >
                Nuova conversazione
              </button>
            )}
          </div>
        ) : (
          <div className="chat-stagger">
            {filtered.map(conv => {
              const other = conv.otherUser || {}
              const role = ROLES[other.role] || ROLES.operatore
              const unread = unreadByConversation[conv.id] || 0
              const isActive = activeConversationId === conv.id
              const online = isOnlineish(other.id)
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={`w-full flex items-center gap-3.5 px-3 py-3.5 rounded-2xl text-left press-scale conv-item ${isActive ? 'conv-item-active' : ''}`}
                  style={{
                    background: unread > 0 && !isActive
                      ? 'color-mix(in srgb, var(--color-primary) 6%, transparent)'
                      : 'transparent',
                    borderLeft: unread > 0 && !isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                  }}
                >
                  {/* Avatar with online dot */}
                  <div className="relative shrink-0">
                    <div
                      className="rounded-full flex items-center justify-center text-white font-bold"
                      style={{
                        width: 52, height: 52,
                        background: `linear-gradient(135deg, ${role.color}, ${role.color}bb)`,
                        fontSize: 16,
                        boxShadow: `0 2px 10px ${role.color}25`,
                      }}
                    >
                      {getInitials(other.name)}
                    </div>
                    {online && (
                      <div
                        className="online-dot absolute -bottom-0.5 -right-0.5"
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-semibold truncate"
                          style={{
                            color: 'var(--color-text)',
                            fontSize: 15,
                            fontWeight: unread > 0 ? 700 : 600,
                          }}
                        >
                          {other.name || 'Utente'}
                        </span>
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded-md shrink-0 font-semibold"
                          style={{
                            background: `${role.color}15`,
                            color: role.color,
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
                        className="text-[14px] truncate"
                        style={{
                          color: unread > 0 ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                          fontWeight: unread > 0 ? 500 : 400,
                        }}
                      >
                        {conv.last_message_text || 'Nessun messaggio'}
                      </p>
                      {unread > 0 && (
                        <span
                          className="shrink-0 min-w-[22px] h-[22px] rounded-full flex items-center justify-center text-[12px] font-bold text-white px-1.5 count-bounce"
                          style={{
                            background: 'var(--gradient-primary)',
                            boxShadow: '0 2px 8px rgba(124, 106, 255, 0.3)',
                          }}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
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

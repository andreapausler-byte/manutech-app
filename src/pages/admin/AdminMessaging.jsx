/**
 * AdminMessaging — Desktop split-pane messaging premium
 *
 * Features:
 *  - Active conversation highlight nella lista
 *  - Divisore visivo con grip decorativo
 *  - Empty state con icone animate
 */

import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDirectMessageRealtime } from '../../hooks/useDirectMessageRealtime'
import ConversationList from '../../components/messaging/ConversationList'
import ConversationView from '../../components/messaging/ConversationView'
import { MessageCircle, Send, Sparkles } from 'lucide-react'

export default function AdminMessaging() {
  const { user } = useAuth()
  const { unreadByConversation, markDMAsRead } = useDirectMessageRealtime(user?.id)
  const [activeConversation, setActiveConversation] = useState(null)

  const handleSelectConversation = (conv) => {
    setActiveConversation(conv)
    markDMAsRead(conv.id)
  }

  return (
    <div
      className="flex h-[calc(100vh-64px)] rounded-2xl overflow-hidden"
      style={{
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Left panel — conversation list */}
      <div className="w-[360px] shrink-0 flex flex-col overflow-hidden">
        <ConversationList
          user={user}
          onSelectConversation={handleSelectConversation}
          unreadByConversation={unreadByConversation}
          activeConversationId={activeConversation?.id}
        />
      </div>

      {/* Divider with grip */}
      <div
        className="w-px shrink-0 relative"
        style={{ background: 'var(--color-border)' }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 flex flex-col gap-1 py-2 px-1 rounded-full"
          style={{ background: 'var(--color-surface-2)' }}
        >
          <div className="w-1 h-1 rounded-full" style={{ background: 'var(--color-text-tertiary)' }} />
          <div className="w-1 h-1 rounded-full" style={{ background: 'var(--color-text-tertiary)' }} />
          <div className="w-1 h-1 rounded-full" style={{ background: 'var(--color-text-tertiary)' }} />
        </div>
      </div>

      {/* Right panel — active conversation or placeholder */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConversation ? (
          <ConversationView
            conversation={activeConversation}
            user={user}
            otherUser={activeConversation.otherUser}
            variant="desktop"
            onBack={() => setActiveConversation(null)}
            onMessageSent={() => markDMAsRead(activeConversation.id)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            {/* Animated icon composition */}
            <div className="relative w-24 h-24">
              <div
                className="absolute inset-0 rounded-3xl flex items-center justify-center animate-scale-in"
                style={{ background: 'var(--gradient-primary)', opacity: 0.08 }}
              >
                <MessageCircle size={48} style={{ color: 'var(--color-primary)', opacity: 0.5 }} />
              </div>
              <div
                className="absolute -top-2 -right-3 animate-scale-in"
                style={{ animationDelay: '150ms' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--color-surface-2)', boxShadow: 'var(--shadow-md)' }}
                >
                  <Send size={16} style={{ color: 'var(--color-primary)' }} />
                </div>
              </div>
              <div
                className="absolute -bottom-2 -left-2 animate-scale-in"
                style={{ animationDelay: '250ms' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--color-surface-2)', boxShadow: 'var(--shadow-md)' }}
                >
                  <Sparkles size={13} style={{ color: 'var(--color-primary)' }} />
                </div>
              </div>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg" style={{ color: 'var(--color-text-secondary)' }}>
                Messaggi diretti
              </p>
              <p className="text-sm mt-1.5 max-w-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Seleziona una conversazione o iniziane una nuova per comunicare con il team
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

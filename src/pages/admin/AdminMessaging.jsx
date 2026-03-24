/**
 * AdminMessaging — Pagina messaggi diretti per admin desktop
 *
 * Layout split-pane: lista conversazioni a sinistra, chat attiva a destra.
 */

import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDirectMessageRealtime } from '../../hooks/useDirectMessageRealtime'
import ConversationList from '../../components/messaging/ConversationList'
import ConversationView from '../../components/messaging/ConversationView'
import { MessageCircle } from 'lucide-react'

export default function AdminMessaging() {
  const { user } = useAuth()
  const { unreadByConversation, markDMAsRead } = useDirectMessageRealtime(user?.id)
  const [activeConversation, setActiveConversation] = useState(null)

  const handleSelectConversation = (conv) => {
    setActiveConversation(conv)
    markDMAsRead(conv.id)
  }

  return (
    <div className="flex h-[calc(100vh-64px)] rounded-2xl overflow-hidden" style={{
      border: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
    }}>
      {/* Left panel — conversation list */}
      <div
        className="w-[340px] shrink-0 flex flex-col overflow-hidden"
        style={{ borderRight: '1px solid var(--color-border)' }}
      >
        <ConversationList
          user={user}
          onSelectConversation={handleSelectConversation}
          unreadByConversation={unreadByConversation}
        />
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
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--color-surface-2)' }}
            >
              <MessageCircle size={40} style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-base" style={{ color: 'var(--color-text-secondary)' }}>
                Messaggi diretti
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                Seleziona una conversazione o iniziane una nuova
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

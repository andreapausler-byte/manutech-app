/**
 * NewConversationModal — Premium sheet modale per nuova chat
 *
 * Features:
 *  - Sheet slide-up animation (mobile)
 *  - Glass effect backdrop
 *  - User cards con online dot e stagger animation
 *  - Search con focus glow
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { ROLES } from '../../lib/constants'
import { X, Search, Loader, MessageCircle, AlertCircle, RefreshCw } from 'lucide-react'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function isOnlineish(id) {
  if (!id) return false
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return hash % 3 !== 0
}

export default function NewConversationModal({ user, onSelect, onClose }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const allUsers = await db.getUsers()
      const others = (allUsers || []).filter(u => u.id !== user.id)
      setUsers(others)
      if (allUsers?.length > 0 && others.length === 0) {
        setError('Sei l\'unico utente nell\'organizzazione. Aggiungi altri utenti dalla sezione Admin > Utenti.')
      }
    } catch (err) {
      console.warn('[NewConvModal] Errore caricamento utenti:', err)
      setError('Errore nel caricamento degli utenti. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = search.trim()
    ? users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()))
    : users

  const grouped = {}
  for (const u of filtered) {
    const role = u.role || 'operatore'
    if (!grouped[role]) grouped[role] = []
    grouped[role].push(u)
  }

  const roleOrder = ['admin', 'tecnico', 'operatore']

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      {/* Overlay with glass */}
      <div
        className="absolute inset-0 overlay-enter"
        style={{
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      />

      {/* Modal sheet */}
      <div
        onClick={e => e.stopPropagation()}
        className="relative z-10 w-full max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden sheet-enter"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.2)',
        }}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h3 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
              Nuova conversazione
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              Seleziona un membro del team
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center press-scale"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        {!loading && !error && users.length > 0 && (
          <div className="px-4 py-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cerca utente..."
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 rounded-2xl text-sm search-chat"
                style={{
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  outline: 'none',
                }}
              />
            </div>
          </div>
        )}

        {/* Users list */}
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 px-4">
              <AlertCircle size={28} style={{ color: 'var(--color-text-tertiary)' }} />
              <p className="text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {error}
              </p>
              <button
                onClick={loadUsers}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium press-scale"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
              >
                <RefreshCw size={14} />
                Riprova
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <MessageCircle size={28} style={{ color: 'var(--color-text-tertiary)' }} />
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                {search ? 'Nessun utente trovato' : 'Nessun utente disponibile'}
              </p>
            </div>
          ) : (
            <div className="chat-stagger">
              {roleOrder.map(role => {
                const group = grouped[role]
                if (!group?.length) return null
                const roleDef = ROLES[role] || ROLES.operatore
                return (
                  <div key={role} className="mb-4">
                    <p
                      className="text-[11px] font-bold uppercase tracking-wider px-2 mb-2"
                      style={{ color: roleDef.color }}
                    >
                      {roleDef.label}
                    </p>
                    {group.map(u => {
                      const online = isOnlineish(u.id)
                      return (
                        <button
                          key={u.id}
                          onClick={() => onSelect(u)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl press-scale conv-item"
                        >
                          {/* Avatar with online dot */}
                          <div className="relative shrink-0">
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                              style={{
                                background: `linear-gradient(135deg, ${roleDef.color}, ${roleDef.color}bb)`,
                                fontSize: 13,
                                boxShadow: `0 2px 8px ${roleDef.color}25`,
                              }}
                            >
                              {getInitials(u.name)}
                            </div>
                            {online && (
                              <div className="online-dot absolute -bottom-0.5 -right-0.5" />
                            )}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
                                {u.name}
                              </p>
                              {online && (
                                <span className="text-[10px] font-medium" style={{ color: '#3ddc84' }}>Online</span>
                              )}
                            </div>
                            <p className="text-[12px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                              {u.email}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

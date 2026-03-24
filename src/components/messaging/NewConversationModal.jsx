/**
 * NewConversationModal — Selettore utente per nuova chat
 *
 * Lista utenti org filtrabili per nome, raggruppati per ruolo.
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { ROLES } from '../../lib/constants'
import { X, Search, Loader, MessageCircle } from 'lucide-react'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default function NewConversationModal({ user, onSelect, onClose }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const allUsers = await db.getUsers()
        // Exclude self
        setUsers(allUsers.filter(u => u.id !== user.id))
      } catch (err) {
        console.warn('[NewConvModal] Errore:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user.id])

  const filtered = search.trim()
    ? users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()))
    : users

  // Group by role
  const grouped = {}
  for (const u of filtered) {
    const role = u.role || 'operatore'
    if (!grouped[role]) grouped[role] = []
    grouped[role].push(u)
  }

  const roleOrder = ['admin', 'tecnico', 'operatore']

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md max-h-[80vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
            Nuova conversazione
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg press-scale" style={{ color: 'var(--color-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca utente..."
              autoFocus
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

        {/* Users list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <MessageCircle size={28} style={{ color: 'var(--color-text-tertiary)' }} />
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                {search ? 'Nessun utente trovato' : 'Nessun utente disponibile'}
              </p>
            </div>
          ) : (
            roleOrder.map(role => {
              const group = grouped[role]
              if (!group?.length) return null
              const roleDef = ROLES[role] || ROLES.operatore
              return (
                <div key={role} className="mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider px-2 mb-1.5" style={{ color: roleDef.color }}>
                    {roleDef.label}
                  </p>
                  {group.map(u => (
                    <button
                      key={u.id}
                      onClick={() => onSelect(u)}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl press-scale transition-colors hover:bg-[var(--color-surface-2)]"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${roleDef.color}, ${roleDef.color}99)`,
                          fontSize: 13,
                        }}
                      >
                        {getInitials(u.name)}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
                          {u.name}
                        </p>
                        <p className="text-[12px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                          {u.email}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

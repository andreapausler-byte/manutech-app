// Multi-select utenti glove-friendly per coinvolgere più persone in un
// intervento (Sprint 1c MVP). Trigger pill con chip dei selezionati,
// apre Modal (bottom-sheet su mobile / dialog centrale su desktop, già
// gestito dal Modal del progetto).
//
// Esclusioni:
//   - excludeUserIds (es. assigned_to e supervised_by già scelti)
//   - role === 'fornitore' (ADR-008 OQ #3 ancora aperta — fuori scope MVP)
//   - utenti con status !== 'active' (disabilitati)
//
// Pattern coerente con il resto del progetto: stili inline + CSS vars
// (no Tailwind), tap target minimo 44px, haptic 30ms a toggle.

import { useEffect, useMemo, useState } from 'react'
import { Search, X, Check, Users } from 'lucide-react'
import { Modal, Badge, Spinner } from './index.jsx'
import { db } from '../../lib/supabase'
import { useHaptic } from '../../hooks/useHaptic'

const ROLE_LABEL = {
  admin: 'Admin',
  tecnico: 'Tecnico',
  operatore: 'Operatore',
  fornitore: 'Fornitore',
}

const ROLE_COLOR = {
  admin: '#7c6aff',
  tecnico: '#06b6d4',
  operatore: '#22c55e',
  fornitore: '#a855f7',
}

/**
 * @param {Object} props
 * @param {string[]} props.selectedUserIds
 * @param {(ids: string[]) => void} props.onChange
 * @param {string[]} [props.excludeUserIds=[]]
 * @param {Array<{id,name,role,status}>} [props.users] — se omesso, fetch via db.getUsers
 * @param {string} [props.label='Altri utenti coinvolti']
 * @param {string} [props.placeholder='Aggiungi utenti...']
 * @param {boolean} [props.disabled=false]
 */
export default function UserMultiSelect({
  selectedUserIds = [],
  onChange,
  excludeUserIds = [],
  users: usersProp,
  label = 'Altri utenti coinvolti',
  placeholder = 'Aggiungi utenti...',
  disabled = false,
}) {
  const haptic = useHaptic()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [internalUsers, setInternalUsers] = useState(usersProp || null)
  const [loading, setLoading] = useState(!usersProp)

  // Fetch utenti se non passati come prop. Eseguito una volta al mount,
  // o al primo open per ridurre il cold-start del form quando il
  // multi-select non viene mai aperto.
  useEffect(() => {
    if (usersProp) {
      setInternalUsers(usersProp)
      setLoading(false)
      return
    }
    if (internalUsers !== null) return
    setLoading(true)
    db.getUsers()
      .then(u => setInternalUsers(u || []))
      .catch(e => {
        console.warn('[UserMultiSelect] getUsers failed:', e?.message)
        setInternalUsers([])
      })
      .finally(() => setLoading(false))
  }, [usersProp, internalUsers])

  const allUsers = internalUsers || []
  const excludeSet = useMemo(
    () => new Set(excludeUserIds.filter(Boolean)),
    [excludeUserIds]
  )
  const selectedSet = useMemo(
    () => new Set(selectedUserIds.filter(Boolean)),
    [selectedUserIds]
  )

  // Filtra: escludi fornitori (out-of-scope MVP), escludi exclude esplicito,
  // escludi disabled (status !== 'active' quando il campo è popolato).
  // Filtro query: match insensible su name.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allUsers.filter(u => {
      if (!u?.id) return false
      if (u.role === 'fornitore') return false
      if (excludeSet.has(u.id)) return false
      if (u.status && u.status !== 'active') return false
      if (q && !(u.name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [allUsers, query, excludeSet])

  // Risolve i selezionati a oggetti per il rendering chip (potrebbero non
  // essere più nella lista utenti, es. utente rimosso: fallback a id).
  const selectedUsers = useMemo(() => {
    const byId = new Map(allUsers.map(u => [u.id, u]))
    return selectedUserIds
      .filter(Boolean)
      .map(id => byId.get(id) || { id, name: 'Utente sconosciuto', role: null })
  }, [allUsers, selectedUserIds])

  const toggle = (userId) => {
    if (disabled) return
    haptic?.light?.()
    const next = new Set(selectedSet)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    onChange?.(Array.from(next))
  }

  const removeChip = (e, userId) => {
    e.stopPropagation()
    if (disabled) return
    haptic?.light?.()
    onChange?.(selectedUserIds.filter(id => id !== userId))
  }

  return (
    <div>
      {label && (
        <label style={{
          display: 'block',
          fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
          marginBottom: 6,
        }}>
          {label}
        </label>
      )}

      {/* Trigger pill */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className="press-scale"
        style={{
          width: '100%',
          minHeight: 44,
          padding: '8px 10px',
          borderRadius: 10,
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          fontSize: 13,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {selectedUsers.length === 0 ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'var(--color-text-secondary)',
          }}>
            <Users size={14} /> {placeholder}
          </span>
        ) : (
          <>
            {selectedUsers.map(u => (
              <span
                key={u.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: u.role && ROLE_COLOR[u.role]
                    ? `${ROLE_COLOR[u.role]}22`
                    : 'var(--color-surface-3)',
                  color: u.role && ROLE_COLOR[u.role]
                    ? ROLE_COLOR[u.role]
                    : 'var(--color-text)',
                  fontSize: 12, fontWeight: 600,
                }}
              >
                {u.name}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Rimuovi ${u.name}`}
                  onClick={(e) => removeChip(e, u.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') removeChip(e, u.id)
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: 0.7,
                  }}
                >
                  <X size={12} />
                </span>
              </span>
            ))}
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginLeft: 4 }}>
              + Aggiungi
            </span>
          </>
        )}
      </button>

      {/* Modal selezione */}
      <Modal
        open={open}
        onClose={() => { setOpen(false); setQuery('') }}
        title="Coinvolgi utenti"
        size="md"
      >
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          marginBottom: 12,
        }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca per nome..."
            style={{
              flex: 1,
              background: 'transparent', border: 'none', outline: 'none',
              fontSize: 14, color: 'var(--color-text)',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Cancella ricerca"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Lista utenti */}
        <div style={{
          maxHeight: '50vh',
          overflowY: 'auto',
          marginBottom: 12,
          marginLeft: -6, marginRight: -6,
        }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Spinner size={24} />
            </div>
          ) : filtered.length === 0 ? (
            <p style={{
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              padding: '24px 0',
              margin: 0,
            }}>
              {query
                ? 'Nessun utente trovato.'
                : 'Nessun utente disponibile per il coinvolgimento.'}
            </p>
          ) : (
            filtered.map(u => {
              const isSel = selectedSet.has(u.id)
              const roleColor = ROLE_COLOR[u.role] || 'var(--color-text-muted)'
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className="press-scale"
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isSel ? 'rgba(124,106,255,0.12)' : 'transparent',
                    border: '1px solid',
                    borderColor: isSel ? 'rgba(124,106,255,0.30)' : 'transparent',
                    color: 'var(--color-text)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                  }}
                >
                  {/* Checkbox visivo */}
                  <span style={{
                    width: 20, height: 20, borderRadius: 5,
                    background: isSel ? '#7c6aff' : 'var(--color-surface-3)',
                    border: `1px solid ${isSel ? '#7c6aff' : 'var(--color-border)'}`,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {isSel && <Check size={14} color="#fff" />}
                  </span>
                  {/* Nome */}
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontSize: 14, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {u.name}
                  </span>
                  {/* Role badge */}
                  {u.role && (
                    <Badge
                      label={ROLE_LABEL[u.role] || u.role}
                      color={roleColor}
                      bg={`${roleColor}22`}
                    />
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12,
          borderTop: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {selectedUserIds.length} selezionat{selectedUserIds.length === 1 ? 'o' : 'i'}
          </span>
          <button
            type="button"
            onClick={() => { setOpen(false); setQuery('') }}
            className="press-scale"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: 'var(--color-primary)',
              border: 'none',
              color: '#fff',
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Conferma
          </button>
        </div>
      </Modal>
    </div>
  )
}

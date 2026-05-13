import { useMemo, useState } from 'react'
import { Search, X, User as UserIcon, ChevronRight, Briefcase, Wrench, Shield } from 'lucide-react'

/**
 * UserPicker — picker condiviso per assigned_to (esecutore) e supervised_by
 * (supervisore della pianificazione). Riceve users già enriched dal parent
 * con role/counters/specialty/hourlyRate.
 *
 * Props
 *   label                 etichetta in alto
 *   value                 user_id selezionato | null
 *   valueName             snapshot nome utente selezionato (per display)
 *   onChange({id, name, role}) callback quando l'utente sceglie un user (id=null per clear)
 *   users                 array { id, name, role, activeCount, completedOnMachineCount,
 *                                 specialties, hourlyRate, ... }
 *   rolesFilter           array di ruoli ammessi (default tutti)
 *   prioritySpecialty     se valorizzato, riordina i fornitori matching in cima
 *   emptyLabel            stringa da mostrare quando value è null e picker collassato
 *   collapsible           bool — se true, picker collassato di default
 *   changeLabel           label del bottone "Cambia ..." (es. "Cambia supervisore")
 *   inheritedFrom         se valorizzato (es. "INT-123"), mostra hint sotto il picker
 *                         "Copiato da INT-123, modificabile"
 *   loading               bool — mostra "Caricamento utenti..."
 */
export default function UserPicker({
  label,
  value,
  valueName,
  onChange,
  users = [],
  rolesFilter,
  prioritySpecialty,
  emptyLabel = 'Nessuno',
  collapsible = false,
  changeLabel = 'Cambia',
  inheritedFrom,
  loading = false,
}) {
  // Se collapsible=true e value valorizzato → collassato di default.
  // Se collapsible=false → sempre espanso (es. assigned_to).
  const [expanded, setExpanded] = useState(!collapsible || !value)
  const [search, setSearch] = useState('')

  const selected = useMemo(() => users.find(u => u.id === value) || null, [users, value])

  const filtered = useMemo(() => {
    let list = users
    if (rolesFilter?.length) list = list.filter(u => rolesFilter.includes(u.role))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.roleLabel || '').toLowerCase().includes(q) ||
        (u.specialties || []).some(s => s.toLowerCase().includes(q))
      )
    }
    // Riordina mettendo in cima i fornitori con specialty matching
    if (prioritySpecialty) {
      const matching = []
      const others = []
      for (const u of list) {
        if (u.role === 'fornitore' && (u.specialties || []).includes(prioritySpecialty)) {
          matching.push(u)
        } else {
          others.push(u)
        }
      }
      return [...matching, ...others]
    }
    return list
  }, [users, rolesFilter, search, prioritySpecialty])

  const collapse = () => { setExpanded(false); setSearch('') }
  const handlePick = (user) => {
    onChange?.({ id: user.id, name: user.name, role: user.role })
    if (collapsible) collapse()
  }
  const handleClear = (e) => {
    e?.stopPropagation()
    onChange?.({ id: null, name: null, role: null })
    if (collapsible) collapse()
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
          {label}
        </label>
        {expanded && collapsible && (
          <button onClick={collapse} className="press-scale"
            aria-label="Chiudi picker"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              padding: 2, display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 11,
            }}>
            <X size={12} /> Chiudi
          </button>
        )}
      </div>

      {/* Valore selezionato — sempre visibile sopra il picker */}
      <SelectedDisplay
        selected={selected}
        valueName={valueName}
        emptyLabel={emptyLabel}
        onClear={selected ? handleClear : null}
        onChangeRequest={collapsible && !expanded ? () => setExpanded(true) : null}
        changeLabel={changeLabel}
      />

      {/* Hint "Copiato da..." */}
      {inheritedFrom && (
        <p style={{
          fontSize: 11, color: 'var(--color-text-secondary)',
          margin: '4px 2px 0', fontStyle: 'italic',
        }}>
          ↳ Copiato da {inheritedFrom}, modificabile
        </p>
      )}

      {/* Lista espansa */}
      {expanded && (
        <div style={{ marginTop: 6 }}>
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <Search size={12} style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-secondary)',
            }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per nome o specialità…"
              autoFocus
              style={{
                width: '100%', padding: '8px 10px 8px 30px', borderRadius: 10,
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)', fontSize: 13, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{
            maxHeight: 220, overflowY: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            background: 'var(--color-surface-2)',
          }}>
            {loading ? (
              <p style={{ padding: 14, fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
                Caricamento utenti…
              </p>
            ) : filtered.length === 0 ? (
              <p style={{ padding: 14, fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
                Nessun utente corrisponde.
              </p>
            ) : (
              filtered.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelected={u.id === value}
                  isPrioritized={prioritySpecialty && u.role === 'fornitore' && (u.specialties || []).includes(prioritySpecialty)}
                  onPick={() => handlePick(u)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SelectedDisplay({ selected, valueName, emptyLabel, onClear, onChangeRequest, changeLabel }) {
  const isEmpty = !selected && !valueName
  const displayName = selected?.name || valueName
  const role = selected?.role
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 12px', borderRadius: 10,
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
    }}>
      <UserIcon size={14} style={{ color: isEmpty ? 'var(--color-text-secondary)' : 'var(--color-text)' }} />
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 13,
        color: isEmpty ? 'var(--color-text-secondary)' : 'var(--color-text)',
        fontWeight: isEmpty ? 400 : 600,
        fontStyle: isEmpty ? 'italic' : 'normal',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {isEmpty ? emptyLabel : displayName}
      </span>
      {role && <RoleChip role={role} />}
      {onClear && (
        <button onClick={onClear} aria-label="Rimuovi selezione" className="press-scale"
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
            padding: 2, display: 'flex',
          }}>
          <X size={13} />
        </button>
      )}
      {onChangeRequest && (
        <button onClick={onChangeRequest} className="press-scale"
          style={{
            padding: '4px 9px', borderRadius: 999,
            background: 'transparent',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
          {changeLabel} <ChevronRight size={11} />
        </button>
      )}
    </div>
  )
}

function UserRow({ user, isSelected, isPrioritized, onPick }) {
  return (
    <button onClick={onPick} className="press-scale"
      style={{
        width: '100%', padding: '9px 11px',
        background: isSelected ? 'rgba(124,106,255,0.12)' : 'transparent',
        border: 'none', borderBottom: '1px solid var(--color-border)',
        textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
      <span style={{
        width: 14, height: 14, borderRadius: 7,
        border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        background: isSelected ? 'var(--color-primary)' : 'transparent',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--color-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180,
          }}>{user.name}</span>
          <RoleChip role={user.role} />
          {isPrioritized && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
              padding: '2px 5px', borderRadius: 4,
              background: 'rgba(34,197,94,0.15)', color: '#22c55e',
            }}>match specialty</span>
          )}
        </div>
        <p style={{
          fontSize: 10, color: 'var(--color-text-secondary)', margin: '2px 0 0',
          display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          {user.role === 'tecnico' && typeof user.activeCount === 'number' && (
            <span>{user.activeCount} attiv{user.activeCount === 1 ? 'o' : 'i'}</span>
          )}
          {user.role === 'fornitore' && (user.specialties || []).length > 0 && (
            <span>{user.specialties.slice(0, 2).join(', ')}{user.specialties.length > 2 ? '…' : ''}</span>
          )}
          {user.role === 'fornitore' && typeof user.hourlyRate === 'number' && (
            <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>€{user.hourlyRate}/h</span>
          )}
          {typeof user.completedOnMachineCount === 'number' && user.completedOnMachineCount > 0 && (
            <span>{user.completedOnMachineCount} su questa macchina</span>
          )}
        </p>
      </div>
    </button>
  )
}

function RoleChip({ role }) {
  const meta = ROLE_META[role] || ROLE_META.operatore
  const Icon = meta.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 6px', borderRadius: 999,
      background: meta.bg, color: meta.color,
      fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase',
    }}>
      <Icon size={9} /> {meta.label}
    </span>
  )
}

const ROLE_META = {
  admin:     { label: 'Admin',     icon: Shield,    color: '#7c6aff', bg: 'rgba(124,106,255,0.14)' },
  tecnico:   { label: 'Tecnico',   icon: Wrench,    color: '#06b6d4', bg: 'rgba(6,182,212,0.14)' },
  fornitore: { label: 'Fornitore', icon: Briefcase, color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
  operatore: { label: 'Operatore', icon: UserIcon,  color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
}

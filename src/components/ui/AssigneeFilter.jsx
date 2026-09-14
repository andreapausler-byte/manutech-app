// AssigneeFilter — "di chi è questo lavoro?" in due comandi affiancati.
//
//   [👤 Solo i miei · 4]  [ Tutti ▾ ]
//
// Il pulsante è la strada di tutti i giorni: un tap, anche con i guanti, e la
// lista resta solo la mia. Il menù accanto serve la coda lunga — un collega
// preciso, o i ticket senza nessuno sopra — e mostra sempre lo stato corrente,
// così non esistono due comandi che dicono cose diverse.
//
// `people` è [{ id, name, count? }]: nelle liste segnalazioni arriva dai
// record già caricati (con quanti ne ha in carico ciascuno), nei calendari
// dalla rubrica utenti (senza numero — lì conta poter guardare l'agenda di
// un collega anche quando in questo mese è vuota).
//
// Il valore è una stringa sola (vedi lib/assigneeFilter.js): '' | 'me' |
// 'unassigned' | id utente. Il componente non filtra nulla e non interroga il
// DB: decide chi chiama, con matchesAssignee().

import { User } from 'lucide-react'
import {
  ASSIGNEE_ALL,
  ASSIGNEE_MINE,
  ASSIGNEE_UNASSIGNED,
} from '../../lib/assigneeFilter'

const glassBase = {
  background: 'rgba(30, 41, 59, 0.4)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
}

export default function AssigneeFilter({
  value = ASSIGNEE_ALL,
  onChange,
  people = [],
  myCount = null,
  unassignedCount = null,
  showUnassigned = true,
  variant = 'mobile',
  disabled = false,
  style,
}) {
  const isGlass = variant === 'glass'
  const isMine = value === ASSIGNEE_MINE
  const isActive = !!value

  // Il pulsante accende/spegne "solo i miei" partendo da qualsiasi stato:
  // se stavo guardando un collega, il tap mi riporta su di me.
  const toggleMine = () => onChange?.(isMine ? ASSIGNEE_ALL : ASSIGNEE_MINE)

  const pad = isGlass ? '8px 14px' : '6px 12px'
  const fontSize = isGlass ? 13 : 12

  const buttonStyle = {
    ...(isGlass ? glassBase : null),
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    padding: pad,
    fontSize,
    fontWeight: 600,
    borderRadius: 999,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: isMine ? '1px solid var(--color-primary)' : `1px solid ${isGlass ? 'rgba(255,255,255,0.06)' : 'var(--color-border)'}`,
    background: isMine ? 'var(--color-primary-glow)' : (isGlass ? glassBase.background : 'var(--color-surface-2)'),
    color: isMine ? 'var(--color-primary)' : 'var(--color-text-secondary)',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
  }

  const selectStyle = {
    padding: isGlass ? '8px 14px' : '6px 10px',
    fontSize,
    fontWeight: 600,
    borderRadius: 999,
    maxWidth: 170,
    flexShrink: 0,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    outline: 'none',
    border: isActive && !isMine ? '1px solid var(--color-primary)' : `1px solid ${isGlass ? 'rgba(255,255,255,0.06)' : 'var(--color-border)'}`,
    background: isActive && !isMine
      ? 'var(--color-primary-glow)'
      : (isGlass ? 'var(--color-sidebar-bg)' : 'var(--color-surface-2)'),
    color: isActive && !isMine ? 'var(--color-primary)' : 'var(--color-text-secondary)',
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
      <button
        type="button"
        onClick={toggleMine}
        disabled={disabled}
        aria-pressed={isMine}
        className="press-scale"
        style={buttonStyle}
      >
        <User size={13} />
        Solo i miei
        {myCount !== null && (
          <span
            className="tabular-nums"
            style={{
              padding: '1px 7px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: isMine ? 'var(--color-primary)' : 'rgba(255,255,255,0.09)',
              color: isMine ? '#fff' : 'var(--color-text)',
            }}
          >
            {myCount}
          </span>
        )}
      </button>

      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange?.(e.target.value)}
        aria-label="Filtra per assegnatario"
        style={selectStyle}
      >
        <option value={ASSIGNEE_ALL}>Tutti</option>
        <option value={ASSIGNEE_MINE}>Solo i miei{myCount !== null ? ` (${myCount})` : ''}</option>
        {showUnassigned && (
          <option value={ASSIGNEE_UNASSIGNED}>
            Non assegnati{unassignedCount !== null ? ` (${unassignedCount})` : ''}
          </option>
        )}
        {people.length > 0 && (
          <optgroup label="Altre persone">
            {people.map(p => (
              <option key={p.id} value={p.id}>
                {p.count != null ? `${p.name} (${p.count})` : p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  )
}

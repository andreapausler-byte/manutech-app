// Filtro "di chi è" — condiviso da liste segnalazioni e calendari interventi.
//
// Un solo valore stringa copre tutti i casi, così è serializzabile in
// localStorage (e domani in querystring) senza oggetti annidati:
//   ''            → tutti
//   'me'          → assegnati a me, o da me supervisionati dove il campo esiste
//   'unassigned'  → senza assegnatario (la coda "da assegnare" dell'admin)
//   <uuid utente> → assegnati a quella persona
//
// Il match è client-side di proposito: le liste sono già in memoria (search,
// stato e gravità filtrano così da sempre) e la stessa funzione vale identica
// in demo mode, dove non c'è nessuna query da filtrare.

export const ASSIGNEE_ALL = ''
export const ASSIGNEE_MINE = 'me'
export const ASSIGNEE_UNASSIGNED = 'unassigned'

// `record` è una segnalazione (assigned_to) o un intervento (assigned_to +
// supervised_by). Sui record senza supervised_by il secondo ramo è inerte.
//
// `includeCreated`: per l'operatore "i miei" non sono quelli assegnati a lui —
// non gli assegna nulla nessuno — ma quelli che ha aperto lui. Senza questa
// opzione il suo pulsante darebbe sempre lista vuota, cioè sarebbe rotto.
export function matchesAssignee(record, value, currentUserId, { includeCreated = false } = {}) {
  if (!value) return true
  const assignee = record?.assigned_to || null
  const supervisor = record?.supervised_by || null
  if (value === ASSIGNEE_UNASSIGNED) return !assignee
  if (value === ASSIGNEE_MINE) {
    if (!currentUserId) return false
    if (includeCreated && record?.created_by === currentUserId) return true
    return assignee === currentUserId || supervisor === currentUserId
  }
  return assignee === value || supervisor === value
}

export function countAssignee(list = [], value, currentUserId, options) {
  return list.filter(r => matchesAssignee(r, value, currentUserId, options)).length
}

// Le persone del menù vengono dalla lista già caricata, non da una query
// utenti: zero round-trip in più, e compare solo chi ha davvero qualcosa in
// carico (una rubrica di 40 nomi con 3 assegnatari reali è rumore).
// L'utente corrente è escluso — ha già il suo pulsante dedicato.
export function assigneesFromList(list = [], { currentUserId } = {}) {
  const byId = new Map()
  const add = (id, name) => {
    if (!id || id === currentUserId) return
    const entry = byId.get(id) || { id, name: null, count: 0 }
    if (!entry.name && name) entry.name = name
    entry.count += 1
    byId.set(id, entry)
  }
  for (const r of list) {
    add(r?.assigned_to, r?.assigned_to_name)
    add(r?.supervised_by, r?.supervised_by_name)
  }
  return [...byId.values()]
    .map(p => ({ ...p, name: p.name || 'Senza nome' }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// Versione "rubrica" della lista persone, per i calendari: chi ha un'agenda
// (tecnici e admin) anche se in questo mese non ha nulla in programma.
// Nessun `count` — il numero avrebbe senso solo sul periodo visualizzato.
export function colleaguesFromUsers(users = [], { currentUserId, roles = ['tecnico', 'admin'] } = {}) {
  return (users || [])
    .filter(u => u?.id && u.id !== currentUserId && (!roles || roles.includes(u.role)))
    .map(u => ({ id: u.id, name: u.name || u.email || 'Senza nome' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// I filtri salvati prima di questa versione avevano un booleano `onlyMine`.
// Chi aveva il flag attivo lo ritrova come 'me' invece di perderlo al primo
// caricamento.
export function assigneeFromLegacyFilters(saved = {}) {
  if (typeof saved.assignee === 'string') return saved.assignee
  return saved.onlyMine ? ASSIGNEE_MINE : ASSIGNEE_ALL
}

// Etichetta breve per chip e stati vuoti.
export function assigneeLabel(value, people = []) {
  if (!value) return 'Tutti'
  if (value === ASSIGNEE_MINE) return 'Solo i miei'
  if (value === ASSIGNEE_UNASSIGNED) return 'Non assegnati'
  return people.find(p => p.id === value)?.name || 'Persona'
}

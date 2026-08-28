import { useState, useEffect, useMemo, useRef } from 'react'
import hotToast from 'react-hot-toast'
import { db, supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { STATUS, SEVERITY, REPORT_TYPES, REACTIONS, TERMINAL_STATUSES, formatDate, formatTicketId } from '../../lib/constants'
import { PLANNING_STATE } from '../../lib/interventions'
import { findSimilarTickets } from '../../lib/ticketSearch'
import { Button, Modal, Input, Textarea, Select, EmptyState, Spinner, TicketIdBadge } from '../../components/ui'
import MediaCapture from '../../components/media/MediaCapture'
import ReportDetailModal from './reports/ReportDetailModal'
import MergeReportModal from './reports/MergeReportModal'
import { useMergeSegnalazione } from '../../hooks/useMergeSegnalazione'
import { avatarGradient } from '../../hooks/usePremiumUI'
import { Plus, Search, X, ChevronDown, ChevronRight, Star, GitMerge } from 'lucide-react'
import ComponentPill from '../../components/machines/ComponentPill'

const RECENT_COMPLETED_WINDOW_HOURS = 24
// Soglia "ferme da troppo": segnalazioni attive senza attività da 3+ settimane
// finiscono nel banner recupero e portano il chip ⏳ in lista.
const STALE_DAYS = 21
const STALE_MS = STALE_DAYS * 24 * 3600 * 1000
// Sotto questa età l'etichetta "ultimo aggiornamento" si accende (attività calda).
const RECENT_UPDATE_MS = 3 * 3600 * 1000

const SEVERITY_RANK = { critica: 0, alta: 1, media: 2, bassa: 3 }

// Gruppi di recenza per il sort "Ultimo aggiornamento" (design 3a):
// ogni segnalazione attiva cade in un solo gruppo in base all'ultima attività.
const RECENCY_GROUPS = [
  { key: 'oggi', label: 'Oggi' },
  { key: 'ieri', label: 'Ieri' },
  { key: 'settimana', label: 'Ultimi 7 giorni' },
  { key: 'indietro', label: 'Più indietro' },
]

const lastActivityTs = (r) => new Date(r.updated_at || r.created_at || 0).getTime()

const recencyBucket = (ts, nowMs) => {
  const startOfToday = new Date(nowMs); startOfToday.setHours(0, 0, 0, 0)
  if (ts >= startOfToday.getTime()) return 'oggi'
  if (ts >= startOfToday.getTime() - 86400000) return 'ieri'
  if (ts >= nowMs - 7 * 86400000) return 'settimana'
  return 'indietro'
}

const initialsOf = (name) =>
  (name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()

// Età compatta per i pannelli riga (design 3a): mai la data estesa,
// sempre "N g fa" oltre il giorno — le righe restano scandibili.
const compactAgo = (dateStr, nowMs) => {
  if (!dateStr) return ''
  const s = Math.floor((nowMs - new Date(dateStr).getTime()) / 1000)
  if (s < 60) return 'adesso'
  if (s < 3600) return `${Math.floor(s / 60)} min fa`
  if (s < 86400) return `${Math.floor(s / 3600)} h fa`
  return `${Math.floor(s / 86400)} g fa`
}

// ── CellBadge: piccolo badge bordato per celle tabella (gravità/tipo/stato) ──
function CellBadge({ color, label }) {
  // Padding inline: le utility p-*/m-* di Tailwind sono azzerate dal reset
  // globale non-layered di index.css (vale per tutta la pagina).
  return (
    <span
      className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider rounded-md border whitespace-nowrap"
      style={{ background: `${color}15`, color, borderColor: `${color}30`, padding: '3px 10px' }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {label}
    </span>
  )
}

// ── Glass panel style condiviso (header + tabella) ──
const glassPanelStyle = {
  background: 'rgba(30, 41, 59, 0.4)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
}

export default function AdminReports({ initialReportId }) {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ title: '', machine: '', severity: 'media', type: 'correttiva', description: '', component_id: '' })
  const [media, setMedia] = useState([])
  // Pezzi della macchina scelta nel form "Nuova Segnalazione". Il modal
  // admin è un canale di creazione a sé (NewReport è quello mobile): senza
  // questo, l'admin non poteva indicare il componente in apertura.
  const [newComponents, setNewComponents] = useState([])
  const [machines, setMachines] = useState([])
  // Default: ordina per ultima attività (updated_at). Il trigger DB 050
  // propaga updated_at quando arriva un commento, quindi i ticket "vivi"
  // in chat salgono in cima — l'admin vede subito chi sta scrivendo.
  // Con questo sort la lista è raggruppata per recenza (Oggi/Ieri/…);
  // gli altri criteri ('severity', 'created_at') mostrano lista piatta.
  const [sortBy, setSortBy] = useState('updated_at')
  const [archiveOpen, setArchiveOpen] = useState(false)
  // Set dei report_id stellati dall'admin loggato (preferiti personali).
  // Pinnati sempre in cima al sort, indipendentemente dal criterio.
  const [starred, setStarred] = useState(() => new Set())
  // Mappa reportId → { planning_state, active_count, next_at } dalla view
  // reports_with_planning (mig 053). Mostrato come chip accanto al titolo.
  const [planningMap, setPlanningMap] = useState({})
  // Mappa reportId → attività chat (n. messaggi, non letti, feedback per
  // utenti distinti). Chip sotto al titolo: l'admin vede a colpo d'occhio
  // quali ticket "scottano" (discussione viva, conferme, roba da leggere).
  const [activityMap, setActivityMap] = useState({})
  // Mappa reportId → ultimo commento (user_name, text, created_at). Alimenta
  // il pannello "Ultimo aggiornamento" di ogni riga: chi ha scritto per
  // ultimo e cosa, senza aprire il dettaglio.
  const [lastCommentMap, setLastCommentMap] = useState({})
  // Ancora del gruppo "Più indietro" per il bottone RECUPERA del banner stale.
  const staleGroupRef = useRef(null)
  // Merge duplicati (mig 058): segnalazione sorgente del modal "Unisci a…".
  const [mergeSource, setMergeSource] = useState(null)
  const { unmerge } = useMergeSegnalazione()
  const canMergeRole = ['tecnico', 'admin', 'super_admin'].includes(user?.role)

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    const [r, u, m, s] = await Promise.all([
      db.getReports(),
      db.getUsers(),
      db.getMachines(),
      db.getStarredReportIds(user?.id),
    ])
    setReports(r); setUsers(u); setMachines(m); setStarred(s)
    if (!silent) setLoading(false)
    // Planning state e attività chat in second pass — non bloccare il primo paint.
    if (r?.length) {
      const ids = r.map(rep => rep.id)
      db.getPlanningStateForReports(ids)
        .then(map => setPlanningMap(map || {}))
        .catch(e => console.warn('[AdminReports] planning state load failed:', e?.message))
      db.getReportsActivity(ids, user?.id)
        .then(map => setActivityMap(map || {}))
        .catch(e => console.warn('[AdminReports] activity load failed:', e?.message))
      db.getLastCommentsByReports(ids)
        .then(map => setLastCommentMap(map || {}))
        .catch(e => console.warn('[AdminReports] last comments load failed:', e?.message))
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh quando la pagina torna visibile (ritorno tab, app PWA da
  // background): allinea l'ordinamento "Ultima attività" per modifiche
  // server-side che non passano dalla subscription realtime sui commenti
  // (es. cambio status da altro device). Throttle 30s + silent (no spinner)
  // per evitare flicker.
  useEffect(() => {
    let lastVisibleLoadAt = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastVisibleLoadAt < 30_000) return
      lastVisibleLoadAt = now
      load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce 200ms: stesso pattern del mobile per coerenza UX.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(timer)
  }, [search])

  // Mappa machine_id → name per fallback quando lo snapshot `machine` è null.
  const machineNameById = useMemo(() => {
    const m = new Map()
    for (const machine of machines) m.set(machine.id, machine.name)
    return m
  }, [machines])

  // Conteggio duplicati per master (mig 058): calcolato client-side dal set già
  // caricato (i duplicati hanno duplicate_of_id valorizzato). Niente embedded
  // count PostgREST → nessun rischio di ambiguità self-join. Vedi corrections §10.
  const duplicateCountByMaster = useMemo(() => {
    const m = new Map()
    for (const r of reports) {
      if (r.duplicate_of_id) m.set(r.duplicate_of_id, (m.get(r.duplicate_of_id) || 0) + 1)
    }
    return m
  }, [reports])

  // Le segnalazioni duplicate (mig 058) NON compaiono come righe a sé: vivono
  // solo dentro la principale (blocco "Include N…" del dettaglio). Restano in
  // `reports` (passato al dettaglio come allReports) per il lookup dei figli e
  // per duplicateCountByMaster; lista, conteggi e filtri usano visibleReports.
  const visibleReports = useMemo(() => reports.filter(r => !r.duplicate_of_id), [reports])

  // Toggle stella con optimistic update. Se la chiamata DB fallisce,
  // rollback dello state per coerenza UI ↔ DB.
  const toggleStar = async (reportId, e) => {
    e?.stopPropagation()
    if (!user?.id) return
    const isStarred = starred.has(reportId)
    setStarred(prev => {
      const next = new Set(prev)
      if (isStarred) next.delete(reportId)
      else next.add(reportId)
      return next
    })
    try {
      await db.toggleReportStar(user.id, reportId, !isStarred)
    } catch (err) {
      console.warn('[ManuTech] toggleStar fallito, rollback:', err.message)
      setStarred(prev => {
        const next = new Set(prev)
        if (isStarred) next.add(reportId)
        else next.delete(reportId)
        return next
      })
    }
  }

  // ── Realtime: nuovo commento → bump updated_at della riga corrispondente.
  // Il trigger DB 050 fa lo stesso server-side; qui lo riflettiamo subito
  // in UI senza un fetch completo, così la riga risale in cima al sort
  // "Ultima attività" mentre l'admin sta guardando la lista.
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel('admin-reports-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        (payload) => {
          const reportId = payload.new?.report_id
          const createdAt = payload.new?.created_at || new Date().toISOString()
          if (!reportId) return
          setReports(prev => prev.map(r =>
            r.id === reportId ? { ...r, updated_at: createdAt } : r
          ))
          // Il pannello "Ultimo aggiornamento" della riga riflette subito il
          // nuovo messaggio, senza refetch.
          setLastCommentMap(prev => ({
            ...prev,
            [reportId]: {
              report_id: reportId,
              text: payload.new?.text || '',
              user_name: payload.new?.user_name || '',
              media: payload.new?.media || null,
              created_at: createdAt,
            },
          }))
          // Bump dei chip attività senza refetch: +1 messaggio, +1 non letto
          // se scrive qualcun altro (i propri messaggi non contano come nuovi).
          const isOwn = payload.new?.user_id === user?.id
          setActivityMap(prev => {
            const cur = prev[reportId] || {
              comment_count: 0, unread_count: 0, last_comment_at: null,
              reactions: { utile: 0, confermo: 0, risolto: 0 },
            }
            return {
              ...prev,
              [reportId]: {
                ...cur,
                comment_count: cur.comment_count + 1,
                unread_count: cur.unread_count + (isOwn ? 0 : 1),
                last_comment_at: createdAt,
              },
            }
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  // ── Deep link da email: apri report specifico ──
  // Se il target è un duplicato (unito a una master), apri direttamente la
  // master: la duplicata vive solo dentro la principale, niente dead-end.
  useEffect(() => {
    if (initialReportId && !loading && !selected) {
      db.getReport(initialReportId).then(report => {
        if (!report) return
        if (report.duplicate_of_id) {
          db.getReport(report.duplicate_of_id)
            .then(master => {
              if (master) {
                setSelected(master)
                hotToast('Aperta la segnalazione principale (questa era un duplicato)', { icon: '🔗' })
              } else {
                setSelected(report)
              }
            })
            .catch(() => setSelected(report))
          return
        }
        setSelected(report)
      }).catch(() => console.warn('[ManuTech] Impossibile caricare report:', initialReportId))
    }
  }, [initialReportId, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Aprire il dettaglio (che contiene la chat) azzera i non letti per
  // l'admin corrente: upsert su chat_reads + azzeramento ottimistico del
  // chip, senza refetch. Stessa semantica del mobile (MobileLayout).
  useEffect(() => {
    if (!selected?.id || !user?.id) return
    db.markChatRead(selected.id, user.id)
    setActivityMap(prev => {
      const cur = prev[selected.id]
      if (!cur?.unread_count) return prev
      return { ...prev, [selected.id]: { ...cur, unread_count: 0 } }
    })
  }, [selected?.id, user?.id])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Cambio macchinario: i pezzi della macchina precedente non c'entrano più.
  const setMachine = async (machineName) => {
    setForm(f => ({ ...f, machine: machineName, component_id: '' }))
    const machine = machines.find(m => m.name === machineName)
    if (!machine) { setNewComponents([]); return }
    try {
      setNewComponents(await db.getMachineComponents(machine.id) || [])
    } catch (e) {
      console.warn('[AdminReports] getMachineComponents failed:', e?.message)
      setNewComponents([])
    }
  }

  // Search estesa per coerenza con la mobile (ReportsList.jsx): titolo,
  // descrizione, macchina (snapshot + fallback via machine_id), tecnico
  // assegnato, creatore, TK-id (normalizzato) e UUID raw.
  const filtered = visibleReports.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterSeverity && r.severity !== filterSeverity) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase().trim()
      if (!q) return true
      const qNorm = q.replace(/[^a-z0-9]/g, '')
      const tk = formatTicketId(r).toLowerCase()
      const tkNorm = tk.replace(/[^a-z0-9]/g, '')
      const machineFromLookup = r.machine_id ? machineNameById.get(r.machine_id) : null
      const searchable = [
        r.title,
        r.description,
        r.machine,
        r.machine_name,
        machineFromLookup,
        r.assigned_to_name,
        r.created_by_name,
        r.id,
      ]
      const textMatch = searchable.some(f =>
        f?.toString().toLowerCase().includes(q)
      )
      const tkMatch = tk.includes(q) || (qNorm.length > 0 && tkNorm.includes(qNorm))
      if (!textMatch && !tkMatch) return false
    }
    return true
  })

  const activeFilters = [filterStatus, filterSeverity].filter(Boolean).length

  const sorted = [...filtered].sort((a, b) => {
    // Le stellate vincono sempre, qualunque sia il sort attivo: pin rigido
    // in cima alla GitHub. Tra due stellate (o due non stellate) si applica
    // il criterio scelto dall'utente. Nel sort per recenza il pin agisce
    // dentro il proprio gruppo (Oggi/Ieri/…), non lo scavalca.
    const aStar = starred.has(a.id) ? 1 : 0
    const bStar = starred.has(b.id) ? 1 : 0
    if (aStar !== bStar) return bStar - aStar
    switch (sortBy) {
      case 'severity': {
        const d = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
        if (d !== 0) return d
        return lastActivityTs(b) - lastActivityTs(a)
      }
      case 'created_at':
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      default:
        return lastActivityTs(b) - lastActivityTs(a)
    }
  })

  // Split in attive + archivio (risolta/chiuso).
  // I terminali aggiornati entro RECENT_COMPLETED_WINDOW_HOURS restano nella
  // lista attiva al loro posto per updated_at: così l'admin vede subito il
  // completamento appena avvenuto come conferma visiva, e scendono in Archivio
  // solo quando "raffreddano". Se l'utente filtra esplicitamente su uno stato
  // terminale, mostra lista piatta come prima.
  const isFilteringArchive = TERMINAL_STATUSES.includes(filterStatus)
  const recentWindowMs = RECENT_COMPLETED_WINDOW_HOURS * 3600 * 1000
  // Rinfresca quando il dataset cambia (load() dopo create/update o realtime
  // bump da nuovi commenti): coerente con la spec "ricalcolo al prossimo
  // load(), niente timer". `reports` qui è dep come invalidator del memo,
  // non letto nella closure.
  // eslint-disable-next-line react-hooks/purity, react-hooks/exhaustive-deps -- Date.now stabile dentro useMemo([reports])
  const nowMs = useMemo(() => Date.now(), [reports])
  const isRecentTerminal = (r) => {
    if (!TERMINAL_STATUSES.includes(r.status)) return false
    const ts = new Date(r.updated_at || r.created_at).getTime()
    return Number.isFinite(ts) && (nowMs - ts) < recentWindowMs
  }
  const activeReports = isFilteringArchive
    ? sorted
    : sorted.filter(r => !TERMINAL_STATUSES.includes(r.status) || isRecentTerminal(r))
  const archivedReports = isFilteringArchive
    ? []
    : sorted.filter(r => TERMINAL_STATUSES.includes(r.status) && !isRecentTerminal(r))
  const hasArchiveSeparator = !isFilteringArchive && archivedReports.length > 0
  const autoExpandArchive = !!search && archivedReports.length > 0
  const archiveVisible = archiveOpen || autoExpandArchive

  // ── Design 3a: raggruppamento per recenza dell'ultimo aggiornamento ──
  // Attivo solo col sort di default; con Gravità/Data apertura lista piatta.
  const groupedActive = sortBy === 'updated_at'
    ? RECENCY_GROUPS
        .map(g => ({ ...g, list: activeReports.filter(r => recencyBucket(lastActivityTs(r), nowMs) === g.key) }))
        .filter(g => g.list.length > 0)
    : [{ key: 'all', label: null, list: activeReports }]

  // ── KPI di testata: dove serve attenzione adesso ──
  const isStaleReport = (r) =>
    !TERMINAL_STATUSES.includes(r.status) && (nowMs - lastActivityTs(r)) >= STALE_MS
  const unreadTicketsCount = visibleReports.filter(r => (activityMap[r.id]?.unread_count || 0) > 0).length
  const openCount = visibleReports.filter(r => r.status === 'aperta').length
  const inProgressCount = visibleReports.filter(r => r.status === 'in_lavorazione').length
  const staleCount = visibleReports.filter(isStaleReport).length
  const oldestStaleDays = staleCount > 0
    ? Math.max(...visibleReports.filter(isStaleReport).map(r => Math.floor((nowMs - lastActivityTs(r)) / 86400000)))
    : 0

  // "Forse cercavi": TK-id a ≤1 errore di battitura dalla query numerica.
  // Su visibleReports (i duplicati uniti non sono righe apribili) e ignorando
  // i filtri stato/gravità: un ID esatto nascosto da un filtro riemerge qui.
  const searchSuggestions = useMemo(
    () => (debouncedSearch ? findSimilarTickets(debouncedSearch, visibleReports) : []),
    [debouncedSearch, visibleReports]
  )

  // RECUPERA → porta al gruppo "Più indietro", dove le ferme vivono sempre.
  const scrollToStale = () => {
    if (sortBy !== 'updated_at') setSortBy('updated_at')
    setTimeout(() => staleGroupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  const createReport = async () => {
    if (!form.title.trim() || !form.description.trim()) return
    const selComp = newComponents.find(c => c.id === form.component_id) || null
    const created = await db.createReport({
      title: form.title.trim(), machine: form.machine || null,
      component_id: selComp?.id || null, component_name: selComp?.name || null,
      severity: form.severity, type: form.type, description: form.description.trim(),
      media,
      created_by: user?.id,
      created_by_name: user?.name || 'Admin',
      status: 'aperta',
    })
    if (created?.id) {
      db.addNotification({
        type: form.severity === 'critica' ? 'new_report_critical' : 'new_report',
        title: `${formatTicketId(created)} · ${form.title.trim()}`,
        body: `${user?.name || 'Admin'} ha creato una segnalazione ${form.severity}`,
        report_id: created.id,
        from_user: user?.id,
        target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))
    }
    setShowNew(false)
    setForm({ title: '', machine: '', severity: 'media', type: 'correttiva', description: '', component_id: '' })
    setNewComponents([])
    setMedia([])
    load()
  }

  const handleDetailUpdate = (updates) => {
    setSelected(s => s ? { ...s, ...updates } : null)
    load()
  }

  const handleDetailClose = (deleted) => {
    setSelected(null)
    if (deleted) load()
  }

  // Apre il dettaglio di un report dato l'id (navigazione banner/figli del merge).
  const openReportById = (id) => {
    const inList = reports.find(r => r.id === id)
    if (inList) { setSelected(inList); return }
    db.getReport(id).then(r => { if (r) setSelected(r) }).catch(() => {})
  }

  // Successo merge: chiudi il modal, aggiorna l'eventuale dettaglio aperto sul
  // duplicato, refetch, e mostra un toast "Annulla" (undo, ~8s) che invoca unmerge.
  const handleMerged = (result, meta) => {
    setMergeSource(null)
    setSelected(s => (s && s.id === meta.duplicateId ? { ...s, ...result } : s))
    load()
    hotToast.custom((t) => (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 12, maxWidth: 380,
        background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-xl)',
      }}>
        <GitMerge size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'var(--color-text)' }}>
          Unita a <strong>{formatTicketId(meta.masterReport)}</strong>
        </span>
        <button
          onClick={() => { hotToast.dismiss(t.id); unmerge(meta.duplicateId, { onSuccess: () => load() }) }}
          style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}
        >
          Annulla
        </button>
        <button onClick={() => hotToast.dismiss(t.id)} aria-label="Chiudi"
          style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex' }}>
          <X size={14} />
        </button>
      </div>
    ), { duration: 8000 })
  }

  // ── Riga-card (design 3a): contenuto | ultimo aggiornamento | assegnatario ──
  const renderReportRow = (r, archived) => {
    const sts = STATUS[r.status] || STATUS.aperta
    const sev = SEVERITY[r.severity] || SEVERITY.media
    const typ = r.type && REPORT_TYPES[r.type] ? REPORT_TYPES[r.type] : null
    const isStarred = starred.has(r.id)
    const dupCount = duplicateCountByMaster.get(r.id) || 0
    const canMergeRow = canMergeRole && !r.duplicate_of_id && dupCount === 0 && !TERMINAL_STATUSES.includes(r.status)
    const planning = planningMap[r.id]
    const planningMeta = planning && PLANNING_STATE[planning.planning_state]
    // Mostra il chip solo per gli stati informativi (da_pianificare, pianificato,
    // in_corso). risolta/altro restano impliciti dal status badge esistente.
    const showPlanningChip = planningMeta
      && ['da_pianificare', 'pianificato', 'in_corso'].includes(planning.planning_state)
    const activity = activityMap[r.id]
    const lastComment = lastCommentMap[r.id]
    const unread = activity?.unread_count || 0
    const stale = isStaleReport(r)
    const lastTs = r.updated_at || r.created_at
    const isHotUpdate = (nowMs - lastActivityTs(r)) < RECENT_UPDATE_MS
    const machineName = r.machine || (r.machine_id ? machineNameById.get(r.machine_id) : null)
    const snippet = lastComment
      ? (lastComment.text?.trim() || (lastComment.media?.length ? '📷 Foto allegata' : '…'))
      : null

    return (
      <div
        key={r.id}
        onClick={() => setSelected(r)}
        className="group cursor-pointer rounded-xl flex items-stretch overflow-hidden transition-all duration-200 hover:-translate-y-px"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border-subtle)',
          borderLeft: `3px solid ${sev.color}`,
          opacity: archived ? 0.75 : 1,
        }}
      >
        {/* Colonna principale: meta, titolo, badge */}
        <div className="flex-1 min-w-0 flex flex-col gap-2.5" style={{ padding: '16px 20px' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={(e) => toggleStar(r.id, e)}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-white/5 transition-colors shrink-0"
              aria-label={isStarred ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
              aria-pressed={isStarred}
              title={isStarred ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            >
              <Star
                size={14}
                fill={isStarred ? '#facc15' : 'none'}
                color={isStarred ? '#facc15' : 'var(--color-text-muted)'}
                strokeWidth={isStarred ? 1.5 : 1.8}
              />
            </button>
            <TicketIdBadge report={r} className="text-[10px] font-bold shrink-0" style={{
              display: 'inline-block',
              padding: '2px 7px',
              borderRadius: 4,
              letterSpacing: 1,
              fontFamily: '"JetBrains Mono", monospace',
              background: 'var(--color-primary-glow)',
              color: 'var(--color-primary)',
            }} />
            {dupCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-bold rounded shrink-0"
                title={`Include ${dupCount} ${dupCount === 1 ? 'segnalazione unita' : 'segnalazioni unite'}`}
                style={{ background: 'rgba(250,204,21,0.16)', color: '#facc15', padding: '2px 7px' }}
              >
                <GitMerge size={11} /> {dupCount}
              </span>
            )}
            {machineName && (
              <span
                className="text-[11px] font-semibold truncate"
                style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--color-primary)' }}
              >
                {machineName}
              </span>
            )}
            {r.component_name && (
              <ComponentPill name={r.component_name} size="xs" className="shrink-0" />
            )}
            {showPlanningChip && (
              <span
                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded shrink-0"
                style={{ background: planningMeta.bg, color: planningMeta.color, padding: '2px 7px' }}
                title={planning.next_at ? `Prossimo: ${formatDate(planning.next_at)}` : undefined}
              >
                <span>{planningMeta.icon}</span> {planningMeta.label}
              </span>
            )}
            <div className="flex items-center gap-2 shrink-0" style={{ marginLeft: 'auto' }}>
              {canMergeRow && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMergeSource(r) }}
                  aria-label="Unisci a un'altra segnalazione"
                  title="Unisci a…"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded-lg hover:bg-violet-500/10 text-muted hover:text-violet-400"
                >
                  <GitMerge size={14} />
                </button>
              )}
              {/* Su schermi senza pannello aggiornamento, l'età resta a vista */}
              <span
                className="xl:hidden text-[11px] font-medium whitespace-nowrap"
                style={{ color: 'var(--color-text-muted)' }}
                title={r.created_at ? `Creata: ${formatDate(r.created_at)}` : undefined}
              >
                {compactAgo(lastTs, nowMs)}
              </span>
            </div>
          </div>

          <div
            className="font-semibold text-[15px] leading-snug group-hover:text-indigo-300 transition-colors"
            style={{ color: 'var(--color-text)' }}
          >
            {r.title}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <CellBadge color={sev.color} label={sev.label} />
            <CellBadge color={sts.color} label={sts.label} />
            {typ && <CellBadge color={typ.color} label={typ.label} />}
            <span className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text-muted)' }}>
              · da {r.created_by_name || 'Sconosciuto'}
            </span>
          </div>
        </div>

        {/* Pannello "Ultimo aggiornamento": chi ha scritto per ultimo e cosa */}
        <div
          className="hidden xl:flex w-[420px] shrink-0 flex-col justify-center gap-2.5"
          style={{ borderLeft: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-0)', padding: '14px 20px' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-faint)' }}>
              Ultimo aggiornamento
            </span>
            <span
              className="text-[11px] font-semibold whitespace-nowrap"
              style={{ fontFamily: '"JetBrains Mono", monospace', color: isHotUpdate ? 'var(--color-success)' : 'var(--color-text-muted)' }}
              title={r.created_at ? `Creata: ${formatDate(r.created_at)}` : undefined}
            >
              {compactAgo(lastTs, nowMs)}
            </span>
          </div>
          {lastComment ? (
            <>
              <div className="flex items-start gap-2.5 min-w-0">
                <span
                  className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                  style={{ background: avatarGradient(lastComment.user_name) }}
                >
                  {initialsOf(lastComment.user_name)}
                </span>
                <div
                  className="text-[12px] leading-snug overflow-hidden"
                  style={{ color: 'var(--color-text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                >
                  <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    {lastComment.user_name || 'Team'}:{' '}
                  </span>
                  {snippet}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {activity?.comment_count > 0 && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full"
                    title={`${activity.comment_count} ${activity.comment_count === 1 ? 'messaggio' : 'messaggi'} in chat`}
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '3px 9px' }}
                  >
                    💬 {activity.comment_count}
                  </span>
                )}
                {Object.entries(REACTIONS).map(([type, { emoji, label }]) => {
                  const n = activity?.reactions?.[type] || 0
                  if (!n) return null
                  return (
                    <span
                      key={type}
                      title={`${label}: ${n} ${n === 1 ? 'persona' : 'persone'}`}
                      className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full"
                      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '3px 9px' }}
                    >
                      {emoji} {n}
                    </span>
                  )
                })}
                {unread > 0 && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold rounded-full"
                    style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary)', padding: '3px 10px' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-primary)' }} />
                    {unread} {unread === 1 ? 'nuovo' : 'nuovi'}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Nessun aggiornamento</span>
                {stale && (
                  <span
                    className="inline-flex items-center gap-1 text-[9px] font-bold rounded-full"
                    style={{ background: 'var(--color-warning-glow)', color: 'var(--color-warning)', padding: '2px 8px' }}
                  >
                    ⏳ {compactAgo(r.created_at, nowMs)}
                  </span>
                )}
              </div>
              <span className="text-[10px]" style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--color-text-faint)' }}>
                Aperta {compactAgo(r.created_at, nowMs)} · nessuno ci ha ancora lavorato
              </span>
            </>
          )}
        </div>

        {/* Colonna assegnatario */}
        <div
          className="hidden md:flex w-[132px] shrink-0 flex-col items-center justify-center gap-2 text-center"
          style={{ borderLeft: '1px solid var(--color-border-subtle)', padding: '14px 8px' }}
        >
          {r.assigned_to_name ? (
            <>
              <span
                className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                style={{ background: avatarGradient(r.assigned_to_name) }}
              >
                {initialsOf(r.assigned_to_name)}
              </span>
              <span className="text-[10px] font-medium truncate w-full" style={{ color: 'var(--color-text-secondary)', padding: '0 4px' }}>
                {r.assigned_to_name}
              </span>
            </>
          ) : (
            <span
              className="text-[9px] font-bold uppercase tracking-wider rounded-md"
              style={{ color: 'var(--color-warning)', border: '1px dashed var(--color-warning)', opacity: 0.9, padding: '7px 10px' }}
            >
              + Assegna
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7 animate-fade-in">

      {/* ═══ PREMIUM HEADER ═══ */}
      <header className="flex flex-col gap-4">
        {/* Breadcrumb */}
        <nav className="flex text-[11px] font-medium uppercase tracking-widest gap-2" style={{ color: 'var(--color-text-muted)' }}>
          <span>Gestione</span>
          <span>/</span>
          <span style={{ color: 'var(--color-primary, #7c6aff)' }}>Segnalazioni</span>
        </nav>

        {/* Title row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight flex items-center gap-4" style={{ color: 'var(--color-text)' }}>
            Segnalazioni
            <span
              className="text-sm font-medium rounded-md border"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
                borderColor: 'var(--color-border)',
                padding: '2px 10px',
              }}
            >
              {visibleReports.length}
            </span>
          </h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative group">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none"
                style={{ color: 'var(--color-text-muted)' }}
              />
              <input
                type="text"
                placeholder="Cerca per titolo, macchinario o autore..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-72 text-sm rounded-full border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                style={{
                  background: 'var(--color-sidebar-bg)',
                  color: 'var(--color-text)',
                  padding: '10px 36px 10px 40px',
                }}
                aria-label="Cerca segnalazioni"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Cancella ricerca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-white"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-white rounded-full bg-linear-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all press-scale"
              style={{ padding: '10px 20px' }}
            >
              <Plus size={16} /> Nuova
            </button>
          </div>
        </div>

        {/* Glass filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tutte */}
          <button
            onClick={() => setFilterStatus('')}
            aria-pressed={filterStatus === ''}
            className="text-sm rounded-full border flex items-center transition-all press-scale"
            style={filterStatus === ''
              ? { ...glassPanelStyle, padding: '8px 16px', background: 'rgba(124,106,255,0.10)', borderColor: 'rgba(124,106,255,0.6)', color: '#a594ff' }
              : { ...glassPanelStyle, padding: '8px 16px', color: 'var(--color-text-muted)' }}
          >
            Tutte
            <span
              className="text-xs font-semibold tabular-nums rounded-md"
              style={{ marginLeft: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.09)', color: 'var(--color-text)' }}
            >
              {visibleReports.length}
            </span>
          </button>

          <div className="h-4 w-px mx-1" style={{ background: 'var(--color-border)' }} />

          {Object.entries(STATUS).map(([key, { label, color }]) => {
            const count = visibleReports.filter(r => r.status === key).length
            const isActive = filterStatus === key
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
                aria-pressed={isActive}
                className="text-sm rounded-full border flex items-center transition-all press-scale"
                style={isActive
                  ? { ...glassPanelStyle, padding: '8px 16px', background: `${color}15`, borderColor: `${color}99`, color }
                  : { ...glassPanelStyle, padding: '8px 16px', color: 'var(--color-text-muted)' }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: color, marginRight: 10 }} />
                {label}
                <span
                  className="text-xs font-semibold tabular-nums rounded-md"
                  style={{ marginLeft: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.09)', color: 'var(--color-text)' }}
                >
                  {count}
                </span>
              </button>
            )
          })}

          {/* Severity filter (compact, right-aligned) */}
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="text-xs rounded-full focus:outline-none"
            style={{
              background: 'var(--color-sidebar-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              padding: '8px 16px',
              marginLeft: 'auto',
            }}
            aria-label="Filtra per gravità"
          >
            <option value="">Tutte le gravità</option>
            {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {activeFilters > 0 && (
            <button
              onClick={() => { setFilterStatus(''); setFilterSeverity('') }}
              className="text-xs rounded-full transition-colors hover:bg-white/5"
              style={{ color: 'var(--color-text-muted)', padding: '8px 12px' }}
            >
              Rimuovi filtri
            </button>
          )}
        </div>

        {/* ═══ KPI: dove serve attenzione adesso (design 3a) ═══ */}
        {!loading && (
          <div className="flex items-stretch gap-3 flex-wrap">
            {[
              { value: unreadTicketsCount, label: <>Con nuovi<br />aggiornamenti</>, color: 'var(--color-primary)' },
              { value: openCount, label: <>Da<br />assegnare</>, color: STATUS.aperta.color },
              { value: inProgressCount, label: <>In corso<br />adesso</>, color: STATUS.in_lavorazione.color },
            ].map((kpi, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl min-w-[140px]"
                style={{ ...glassPanelStyle, padding: '14px 20px' }}
              >
                <span className="text-[28px] font-bold leading-none tabular-nums" style={{ color: kpi.color }}>
                  {kpi.value}
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-wider leading-[1.4]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {kpi.label}
                </span>
              </div>
            ))}
            {staleCount > 0 && (
              <div
                className="flex-1 min-w-[300px] flex items-center justify-between gap-4 rounded-xl"
                style={{
                  background: 'linear-gradient(90deg, rgba(245,158,11,0.12), rgba(245,158,11,0.03))',
                  border: '1px solid rgba(245,158,11,0.35)',
                  padding: '14px 20px',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">⏳</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-warning)' }}>
                      <b className="font-extrabold">{staleCount} {staleCount === 1 ? 'segnalazione ferma' : 'segnalazioni ferme'}</b> da oltre 3 settimane
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: 'var(--color-warning)', opacity: 0.65 }}>
                      Da non perdere — la più vecchia è ferma da {oldestStaleDays} giorni
                    </div>
                  </div>
                </div>
                <button
                  onClick={scrollToStale}
                  className="shrink-0 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-transform press-scale"
                  style={{ background: 'var(--color-warning)', color: '#160f04', padding: '8px 14px' }}
                >
                  Recupera →
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ═══ MAIN DATA AREA ═══ */}
      {loading ? <Spinner /> : filtered.length === 0 ? (
        debouncedSearch ? (
          /* Empty state di ricerca: query non trovata, avviso filtri attivi,
             suggerimenti TK-id a un errore di battitura (come sul mobile). */
          <div className="rounded-2xl flex flex-col items-center text-center" style={{ ...glassPanelStyle, padding: '40px 24px' }}>
            <div className="text-4xl" style={{ marginBottom: 12 }}>🔍</div>
            <div className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              Nessun risultato per “{debouncedSearch}”
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 6 }}>
              Controlla l'ID oppure prova con titolo, macchinario, autore o tecnico
            </div>
            {activeFilters > 0 && (
              <button
                onClick={() => { setFilterStatus(''); setFilterSeverity('') }}
                className="rounded-lg text-sm font-semibold transition-all press-scale"
                style={{
                  marginTop: 16, padding: '9px 16px',
                  background: 'var(--color-primary-glow)', border: '1px solid var(--color-primary)',
                  color: 'var(--color-primary)',
                }}
              >
                Hai filtri attivi che possono nascondere risultati — Rimuovi filtri
              </button>
            )}
            {searchSuggestions.length > 0 && (
              <div className="w-full max-w-xl text-left" style={{ marginTop: 26 }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-muted)', marginBottom: 10 }}>
                  Forse cercavi
                </div>
                <div className="flex flex-col gap-2.5">
                  {searchSuggestions.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="w-full text-left flex items-center gap-3 rounded-xl transition-all press-scale min-w-0"
                      style={{
                        background: 'var(--color-surface-1)',
                        border: '1px solid var(--color-border)',
                        padding: '12px 16px',
                      }}
                    >
                      <span className="shrink-0 text-xs font-bold" style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        color: 'var(--color-primary)', letterSpacing: 0.5,
                      }}>
                        {formatTicketId(r)}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {r.title}
                      </span>
                      {r.machine && (
                        <span className="shrink-0 text-xs" style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--color-text-muted)' }}>
                          {r.machine}
                        </span>
                      )}
                      <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>›</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="📋" title="Nessuna segnalazione trovata"
            subtitle={activeFilters > 0 ? 'Prova a modificare i filtri' : undefined} />
        )
      ) : (
        <div className="flex flex-col gap-5">
          {/* Barra ordinamento (design 3a) */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-faint)' }}>
                Ordina per
              </span>
              {[
                { key: 'updated_at', label: '↓ Ultimo aggiornamento' },
                { key: 'severity', label: 'Gravità' },
                { key: 'created_at', label: 'Data apertura' },
              ].map(opt => {
                const isActive = sortBy === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSortBy(opt.key)}
                    aria-pressed={isActive}
                    className="text-[11px] font-semibold rounded-lg border transition-all press-scale"
                    style={isActive
                      ? { padding: '7px 13px', background: 'var(--color-primary-glow)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                      : { padding: '7px 13px', background: 'var(--color-surface-1)', borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-muted)' }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {unreadTicketsCount > 0 && (
              <span
                className="inline-flex items-center gap-2 text-[11px] font-semibold"
                style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--color-primary)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-primary)' }} />
                {unreadTicketsCount} con aggiornamenti nuovi
              </span>
            )}
          </div>

          {/* Lista raggruppata per recenza dell'ultimo aggiornamento */}
          {groupedActive.map(g => (
            <div
              key={g.key}
              ref={g.key === 'indietro' ? staleGroupRef : undefined}
              className="flex flex-col gap-3 scroll-mt-4"
            >
              {g.label && (
                <div className="flex items-center gap-3" style={{ paddingTop: 6 }}>
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-muted)' }}>
                    {g.label}
                  </span>
                  <span
                    className="text-[10px] font-bold rounded-md tabular-nums"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '2px 7px' }}
                  >
                    {g.list.length}
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--color-border-subtle)' }} />
                </div>
              )}
              {g.list.map(r => renderReportRow(r, false))}
            </div>
          ))}

          {/* Archivio: completate/chiuse raffreddate (>24h) */}
          {hasArchiveSeparator && (
            <button
              onClick={() => setArchiveOpen(o => !o)}
              aria-expanded={archiveVisible}
              className="w-full flex items-center gap-3 rounded-xl text-[11px] font-bold uppercase tracking-widest cursor-pointer select-none hover:bg-white/5 transition-colors"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
                padding: '12px 16px',
              }}
            >
              {archiveVisible ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Archivio
              <span
                className="rounded-md"
                style={{ background: 'var(--color-surface-1)', color: 'var(--color-text-muted)', padding: '2px 8px' }}
              >
                {archivedReports.length}
              </span>
              <span className="font-normal normal-case tracking-normal opacity-60">
                segnalazioni completate o chiuse
              </span>
            </button>
          )}
          {hasArchiveSeparator && archiveVisible && (
            <div className="flex flex-col gap-3">
              {archivedReports.map(r => renderReportRow(r, true))}
            </div>
          )}
        </div>
      )}

      {/* New Report Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Nuova Segnalazione" size="lg">
        <div className="space-y-4">
          <Input label="Titolo *" placeholder="Descrivi il problema"
            value={form.title} onChange={e => set('title', e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Macchinario" value={form.machine} onChange={e => setMachine(e.target.value)}
              options={[{ value: '', label: 'Seleziona...' }, ...machines.map(m => ({ value: m.name, label: m.name }))]} />
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Gravità</label>
              <div className="flex gap-2">
                {Object.entries(SEVERITY).map(([key, { label, color }]) => (
                  <button key={key} onClick={() => set('severity', key)}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${form.severity === key ? 'text-white' : 'bg-surface-2 text-muted'}`}
                    style={form.severity === key ? { background: color } : {}}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          {/* Il pezzo in apertura è un'ipotesi, non una diagnosi: opzionale,
              default "Generico", e compare solo se la macchina ha componenti
              in anagrafica. Si corregge poi dal dettaglio e in chiusura. */}
          {newComponents.length > 0 && (
            <Select label="Componente" value={form.component_id} onChange={e => set('component_id', e.target.value)}
              options={[
                { value: '', label: 'Generico — intera macchina' },
                ...newComponents.map(c => ({ value: c.id, label: c.type ? `${c.name} (${c.type})` : c.name })),
              ]} />
          )}
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Tipo Intervento</label>
            <div className="flex gap-2">
              {Object.entries(REPORT_TYPES).map(([key, { label, color, icon }]) => (
                <button key={key} onClick={() => set('type', key)}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${form.type === key ? 'text-white' : 'bg-surface-2 text-muted'}`}
                  style={form.type === key ? { background: color } : {}}>{icon} {label}</button>
              ))}
            </div>
          </div>
          <Textarea label="Descrizione *" placeholder="Dettagli..."
            value={form.description} onChange={e => set('description', e.target.value)} />
          <MediaCapture media={media} onChange={setMedia} />
          <Button onClick={createReport} className="w-full" size="lg"
            disabled={!form.title.trim() || !form.description.trim()}>
            Crea Segnalazione
          </Button>
        </div>
      </Modal>

      {/* Detail Modal */}
      {selected && (
        <ReportDetailModal
          selected={selected}
          user={user}
          users={users}
          machines={machines}
          allReports={reports}
          onClose={handleDetailClose}
          onUpdate={handleDetailUpdate}
          onRequestMerge={() => setMergeSource(selected)}
          onOpenReport={openReportById}
        />
      )}

      {/* Merge duplicati Modal */}
      {mergeSource && (
        <MergeReportModal
          sourceReport={mergeSource}
          onClose={() => setMergeSource(null)}
          onMerged={handleMerged}
        />
      )}
    </div>
  )
}

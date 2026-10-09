/**
 * AdminMaintenance — Pannello di controllo manutenzioni programmate
 *
 * Vista unificata di tutti i piani e interventi su tutti i macchinari,
 * nel disegno della console desktop (ott 2026): i quattro contatori sono
 * anche i filtri, i piani si leggono come lista divisa per scadenza o come
 * calendario delle prossime 4 settimane, e un piano si apre nel pannello
 * a destra, dove si registra l'esecuzione senza cambiare pagina.
 * Le azioni della pagina stanno nella barra in alto (V6TopBarActions).
 *
 * La vista Interventi è l'archivio delle manutenzioni fatte, come
 * l'Archivio interventi per le segnalazioni: si cerca anche dentro testo,
 * ricambi, note aggiunte dopo e nomi degli allegati, si esporta in CSV, e
 * un clic apre l'intervento (MaintenanceLogModal) per leggerlo o
 * aggiornarlo. "Ultimo" nei piani apre l'ultima esecuzione.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { formatDate } from '../../lib/constants'
import { Button, Modal, Input, Textarea, Spinner } from '../../components/ui'
import { BtnGhost, BtnPrimary } from '../../components/manutech'
import { useAuth } from '../../contexts/AuthContext'
import { V6TopBarActions } from '../../contexts/V6TopBarContext'
import { useToast } from '../../hooks/useToast'
import LogAttachmentsPicker from '../../components/machines/LogAttachmentsPicker'
import MaintenanceLogModal from '../../components/machines/MaintenanceLogModal'
import { hasPdfMedia, logMediaList } from '../../lib/logMedia'
import { logSearchText, getLogRecord, logTypeMeta } from '../../lib/maintenanceLog'
import { getTrafficLight } from '../../lib/maintenanceStatus'
import { Segmented } from './maintenance/MaintenanceBits'
import PlanList from './maintenance/PlanList'
import PlanCalendar from './maintenance/PlanCalendar'
import PlanDrawer from './maintenance/PlanDrawer'
import LogTable from './maintenance/LogTable'
import { MONO, TONES } from './maintenance/planUi'
import { Search, X, Upload } from 'lucide-react'

// CSV con `;` e BOM, come l'Archivio interventi: Excel in italiano lo apre
// a colonne. Con i link degli allegati, per chi tiene i fogli delle ditte.
function downloadLogsCsv(logs) {
  const header = ['Data', 'Tipo', 'Macchina', 'Pezzo', 'Intervento', 'Cosa è stato fatto', 'Eseguito da', 'Durata (min)', 'Ricambi', 'Ditta', 'Rif.', 'Note successive', 'Allegati']
  const esc = (v) => {
    const t = v == null ? '' : String(v)
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const lines = logs.map(l => [
    formatDate(l.performed_at),
    logTypeMeta(l).label,
    l.machine?.name || '',
    l.component?.name || '',
    l.title || '',
    l.description || '',
    l.performed_by_name || '',
    l.duration_minutes ?? '',
    l.parts_replaced || '',
    l.is_external ? (l.contractor_name || 'Ditta esterna') : '',
    l.contractor_reference || '',
    getLogRecord(l).notes.map(n => `${n.user_name || 'Utente'}: ${n.text}`).join(' | '),
    logMediaList(l).map(m => `${m.name || 'allegato'} ${m.url}`).join(' | '),
  ].map(esc).join(';'))
  const blob = new Blob(['\ufeff' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `manutenzioni-eseguite-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const FREQ_PRESETS = [
  { label: 'Settim.', days: 7 }, { label: 'Mensile', days: 30 }, { label: 'Trim.', days: 90 },
  { label: 'Sem.', days: 180 }, { label: 'Annuale', days: 365 },
]

export default function AdminMaintenance() {
  const { user } = useAuth()
  const toast = useToast()

  const [machines, setMachines] = useState([])
  const [users, setUsers] = useState([])
  const [tasks, setTasks] = useState([]) // { plan, machine, lastLog, light }
  const [allLogs, setAllLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('') // '', 'overdue', 'warning', 'ok'
  const [filterMachine, setFilterMachine] = useState('')
  const [viewMode, setViewMode] = useState('plans') // 'plans' | 'logs'
  const [planLayout, setPlanLayout] = useState('list') // 'list' | 'calendar'
  const [filterLogType, setFilterLogType] = useState('') // '', 'programmata', 'straordinaria'
  const [openLog, setOpenLog] = useState(null)
  const [logLimit, setLogLimit] = useState(50)
  const [selectedPlanId, setSelectedPlanId] = useState(null)

  // Plan form
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [planForm, setPlanForm] = useState({ name: '', frequency_days: 30, assigned_to: '', instructions: '', machine_id: '', component_id: '' })
  const [planComponents, setPlanComponents] = useState([])

  // Log form
  const [showLogForm, setShowLogForm] = useState(false)
  const [logForm, setLogForm] = useState({ title: '', description: '', duration_minutes: '', parts_replaced: '', plan_id: '', machine_id: '', component_id: '', media: [] })
  const [logComponents, setLogComponents] = useState([])
  const [logAttaching, setLogAttaching] = useState(false)

  // CSV
  const csvInputRef = useRef(null)
  const [showCSV, setShowCSV] = useState(false)
  const [csvData, setCsvData] = useState([])
  const [csvMachine, setCsvMachine] = useState('')
  const [csvUser, setCsvUser] = useState('')

  // Lo spinner c'è solo alla prima apertura: dopo un salvataggio si
  // ricarica sotto, e il pannello del piano resta aperto con la nuova scadenza.
  const load = async () => {
    try {
      const [m, u, plans, lastLogByPlan, paginatedLogs] = await Promise.all([
        db.getMachines(), db.getUsers(), db.getAllMaintenancePlansWithMachine(),
        db.getLastLogPerPlan(), db.getMaintenanceLogsPaginated(200)
      ])
      setMachines(m); setUsers(u)

      const allTasks = plans.map(plan => {
        const machine = plan.machine
        if (!machine) return null
        const lastLog = lastLogByPlan[plan.id] || null
        const light = getTrafficLight(plan, lastLog)
        return { plan, machine, lastLog, light }
      }).filter(Boolean)

      allTasks.sort((a, b) => a.light.daysLeft - b.light.daysLeft)
      setTasks(allTasks)
      setAllLogs(paginatedLogs)
    } catch (e) {
      toast.error('Errore nel caricamento: ' + (e?.message || 'riprova'))
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- solo alla prima apertura
  useEffect(() => { load() }, [])

  // Stats
  const counts = {
    '': tasks.length,
    overdue: tasks.filter(t => t.light.status === 'overdue').length,
    warning: tasks.filter(t => t.light.status === 'warning').length,
    ok: tasks.filter(t => t.light.status === 'ok').length,
  }

  // Filtered tasks
  const filteredTasks = tasks.filter(t => {
    if (filterStatus && t.light.status !== filterStatus) return false
    if (filterMachine && t.machine.id !== filterMachine) return false
    if (search) {
      const q = search.toLowerCase()
      return [t.plan.name, t.plan.instructions, t.machine.name, t.plan.assigned_to_name, t.plan.component?.name]
        .some(v => v?.toLowerCase().includes(q))
    }
    return true
  })

  const filteredLogs = allLogs.filter(log => {
    if (filterMachine && log.machine_id !== filterMachine) return false
    if (filterLogType === 'programmata' && log.type !== 'programmata') return false
    if (filterLogType === 'straordinaria' && log.type === 'programmata') return false
    if (search) return logSearchText(log).includes(search.toLowerCase())
    return true
  })

  const selectedTask = tasks.find(t => t.plan.id === selectedPlanId) || null

  // Una correzione non ricarica la pagina: si aggiornano la riga in lista e,
  // se è l'ultima esecuzione di un piano, il suo semaforo (la data può
  // essere cambiata). L'intervento torna con la macchina del join.
  const handleLogChanged = (updated) => {
    setAllLogs(prev => prev
      .map(l => (l.id === updated.id ? { ...l, ...updated } : l))
      .sort((a, b) => new Date(b.performed_at) - new Date(a.performed_at)))
    setTasks(prev => prev.map(t => {
      if (t.lastLog?.id !== updated.id) return t
      const lastLog = { ...t.lastLog, ...updated }
      return { ...t, lastLog, light: getTrafficLight(t.plan, lastLog) }
    }))
  }

  // ── Plan CRUD ──
  // Duplica: stesso piano come nuovo, di solito per un'altra macchina.
  const openPlanForm = async (plan = null, { duplicate = false } = {}) => {
    setEditingPlan(duplicate ? null : plan)
    setPlanForm(plan
      ? { name: plan.name, frequency_days: plan.frequency_days, assigned_to: plan.assigned_to || '', instructions: plan.instructions || '', machine_id: plan.machine_id, component_id: plan.component_id || '' }
      : { name: '', frequency_days: 30, assigned_to: '', instructions: '', machine_id: '', component_id: '' })
    setShowPlanForm(true)
    if (plan?.machine_id) {
      try { setPlanComponents(await db.getMachineComponents(plan.machine_id)) } catch { setPlanComponents([]) }
    } else { setPlanComponents([]) }
  }

  const savePlan = async () => {
    if (!planForm.name.trim() || !planForm.machine_id) { toast.warning('Nome e macchinario obbligatori'); return }
    try {
      const assignee = users.find(u => u.id === planForm.assigned_to)
      const data = {
        name: planForm.name.trim(), frequency_days: parseInt(planForm.frequency_days) || 30,
        machine_id: planForm.machine_id, assigned_to: planForm.assigned_to || null,
        assigned_to_name: assignee?.name || null, instructions: planForm.instructions || null,
        component_id: planForm.component_id || null,
        org_id: user?.org_id,
      }
      if (editingPlan) { await db.updateMaintenancePlan(editingPlan.id, data); toast.success('Piano aggiornato') }
      else { await db.createMaintenancePlan(data); toast.success('Piano creato') }
      setShowPlanForm(false); load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const deletePlan = async (plan) => {
    if (!confirm(`Eliminare il piano "${plan.name}"?`)) return
    try {
      await db.deleteMaintenancePlan(plan.id)
      toast.success('Eliminato')
      setSelectedPlanId(null)
      load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  // ── Log ──
  const createLog = async (data) => {
    await db.createMaintenanceLog({
      ...data,
      performed_by: user?.id, performed_by_name: user?.name,
      performed_at: new Date().toISOString(), org_id: user?.org_id,
    })
    // Il foglio della ditta allegato entra nella biblioteca dell'assistente
    // al prossimo reindex: lo lanciamo subito, in sottofondo.
    if (hasPdfMedia(data.media)) {
      db.queueMachineReindex(data.machine_id)
        .catch(e => console.warn('[AdminMaintenance] reindex post-log failed:', e?.message))
    }
  }

  const openLogForm = async (task = null) => {
    const machineId = task?.machine?.id || machines[0]?.id || ''
    setLogForm({
      title: task?.plan?.name || '', description: '', duration_minutes: '', parts_replaced: '',
      plan_id: task?.plan?.id || '', machine_id: machineId,
      // Se il piano nomina un pezzo, il log parte già su quel pezzo:
      // resta correggibile, ma nessuno deve ricompilarlo (migration 063).
      component_id: task?.plan?.component_id || '',
      media: [],
    })
    if (machineId) {
      try { setLogComponents(await db.getMachineComponents(machineId)) } catch { setLogComponents([]) }
    } else { setLogComponents([]) }
    setShowLogForm(true)
  }

  const saveLog = async () => {
    if (!logForm.title.trim() || !logForm.machine_id) { toast.warning('Titolo e macchinario obbligatori'); return }
    try {
      await createLog({
        machine_id: logForm.machine_id, plan_id: logForm.plan_id || null,
        component_id: logForm.component_id || null,
        type: logForm.plan_id ? 'programmata' : 'straordinaria',
        title: logForm.title.trim(), description: logForm.description || null,
        duration_minutes: logForm.duration_minutes ? parseInt(logForm.duration_minutes) : null,
        parts_replaced: logForm.parts_replaced || null,
        media: logForm.media,
      })
      toast.success('Intervento registrato'); setShowLogForm(false); load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  // Dal pannello: l'esecuzione del piano così com'è (titolo, pezzo, tipo).
  const registerPlan = async (task, { description, duration, parts, media }) => {
    try {
      await createLog({
        machine_id: task.machine.id, plan_id: task.plan.id,
        component_id: task.plan.component_id || null,
        type: 'programmata', title: task.plan.name,
        description: description.trim() || null,
        duration_minutes: duration ? parseInt(duration) : null,
        parts_replaced: parts.trim() || null,
        media,
      })
      toast.success('Intervento registrato')
      load()
      return true
    } catch (e) {
      toast.error('Errore: ' + e.message)
      return false
    }
  }

  const closeDrawer = useCallback(() => setSelectedPlanId(null), [])

  // ── CSV ──
  const handleCSV = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean)
      const start = lines[0]?.toLowerCase().includes('attività') ? 1 : 0
      const parsed = []
      for (let i = start; i < lines.length; i++) {
        const p = lines[i].split(';').map(s => s.trim())
        if (p.length >= 2 && p[0] && parseInt(p[1])) parsed.push({ name: p[0], frequency_days: parseInt(p[1]), instructions: p[2] || '' })
      }
      setCsvData(parsed); setShowCSV(true)
    }
    reader.readAsText(file); e.target.value = ''
  }

  const importCSV = async () => {
    if (!csvData.length || !csvMachine) { toast.warning('Seleziona un macchinario'); return }
    const assignee = users.find(u => u.id === csvUser)
    try {
      await db.importMaintenancePlans(csvData.map(p => ({
        machine_id: csvMachine, name: p.name, frequency_days: p.frequency_days,
        assigned_to: csvUser || null, assigned_to_name: assignee?.name || null,
        instructions: p.instructions || null, org_id: user?.org_id,
      })))
      toast.success(`${csvData.length} piani importati!`); setShowCSV(false); setCsvData([]); load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  if (loading) return <Spinner />

  const logCount = allLogs.length >= 200 ? '200+' : allLogs.length
  const recentMachineLogs = selectedTask ? allLogs.filter(l => l.machine_id === selectedTask.machine.id).slice(0, 3) : []
  const planDurations = selectedTask
    ? allLogs.filter(l => l.plan_id === selectedTask.plan.id && l.duration_minutes > 0).map(l => l.duration_minutes)
    : []
  const durationStats = planDurations.length
    ? { avg: Math.round(planDurations.reduce((a, b) => a + b, 0) / planDurations.length), count: planDurations.length }
    : null

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <V6TopBarActions>
        <BtnGhost size="sm" onClick={() => csvInputRef.current?.click()}>↑ Importa CSV</BtnGhost>
        <BtnGhost size="sm" onClick={() => openLogForm()}>Registra intervento</BtnGhost>
        <BtnPrimary size="sm" onClick={() => openPlanForm()}>+ Nuovo piano</BtnPrimary>
      </V6TopBarActions>
      <input ref={csvInputRef} type="file" accept=".csv,.txt" hidden onChange={handleCSV} />

      {/* ═══ Contatori = filtri ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {[
          { id: '', label: 'Tutti i piani', sub: 'attivi in calendario', color: 'var(--color-text)' },
          { id: 'overdue', label: 'Scadute', sub: 'da eseguire subito', color: TONES.overdue.color },
          { id: 'warning', label: 'In scadenza', sub: 'entro 7 giorni', color: TONES.warning.color },
          { id: 'ok', label: 'In regola', sub: 'nessuna azione', color: TONES.ok.color },
        ].map(s => {
          const on = filterStatus === s.id
          return (
            <button key={s.id || 'all'} type="button" aria-pressed={on}
              onClick={() => { setFilterStatus(s.id); setViewMode('plans') }}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: 8,
                padding: '12px 14px', textAlign: 'left', cursor: 'pointer', color: 'var(--color-text)',
                background: on ? 'var(--color-surface-2)' : 'var(--color-surface-1)',
                borderTop: `1px solid ${on ? s.color : 'var(--color-border)'}`,
                borderRight: `1px solid ${on ? s.color : 'var(--color-border)'}`,
                borderBottom: `1px solid ${on ? s.color : 'var(--color-border)'}`,
                borderLeft: `3px solid ${s.color}`,
              }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: on ? s.color : 'var(--color-text-muted)' }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, color: 'var(--color-text-faint)', marginTop: 6 }}>{s.sub}</div>
              </div>
              <span style={{ fontSize: 36, fontWeight: 600, lineHeight: 0.9, color: s.color }}>{counts[s.id]}</span>
            </button>
          )
        })}
      </div>

      {/* ═══ Toolbar ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Segmented label="Vista" value={viewMode} onChange={setViewMode}
          options={[['plans', `Piani ${tasks.length}`], ['logs', `Interventi ${logCount}`]]} />

        <div style={{
          flex: '1 1 220px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
          background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
        }}>
          <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Cerca"
            placeholder={viewMode === 'plans' ? 'Cerca attività, macchinario, responsabile…' : 'Cerca interventi, ricambi, note…'}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--color-text)' }} />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Cancella ricerca"
              style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <X size={14} />
            </button>
          )}
        </div>

        <select value={filterMachine} onChange={e => setFilterMachine(e.target.value)} aria-label="Macchinario"
          style={{
            minWidth: 200, padding: '8px 10px', fontSize: 14, color: 'var(--color-text)',
            background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
          }}>
          <option value="">Tutti i macchinari</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        {viewMode === 'plans' ? (
          <Segmented label="Disposizione" value={planLayout} onChange={setPlanLayout}
            options={[['list', 'Lista'], ['calendar', 'Calendario']]} />
        ) : (
          <>
            <Segmented label="Tipo di intervento" value={filterLogType} onChange={setFilterLogType}
              options={[['', 'Tutti'], ['programmata', 'Programmate'], ['straordinaria', 'Straordinarie']]} />
            {filteredLogs.length > 0 && (
              <BtnGhost size="sm" onClick={() => downloadLogsCsv(filteredLogs)}>↓ Esporta CSV</BtnGhost>
            )}
          </>
        )}
      </div>

      {/* ═══ PLANS VIEW ═══ */}
      {viewMode === 'plans' && planLayout === 'list' && (
        <PlanList
          tasks={filteredTasks}
          grouped={!filterStatus}
          selectedId={selectedPlanId}
          onSelect={setSelectedPlanId}
          onOpenLog={(task) => setOpenLog({ ...task.lastLog, machine: task.machine })}
          onAssign={(plan) => openPlanForm(plan)}
          empty={tasks.length
            ? { text: 'Nessun piano corrisponde ai filtri', hint: 'Cambia filtro o ricerca.' }
            : { text: 'Nessun piano di manutenzione', hint: 'Crea il primo con + Nuovo piano, o importalo da CSV.' }}
        />
      )}
      {viewMode === 'plans' && planLayout === 'calendar' && (
        <PlanCalendar tasks={filteredTasks} onSelect={setSelectedPlanId} />
      )}

      {/* ═══ LOGS VIEW ═══ */}
      {viewMode === 'logs' && (
        <>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, color: 'var(--color-text-faint)' }}>
            {filteredLogs.length} INTERVENTI{filterLogType || filterMachine || search ? ' (FILTRATI)' : ''} · CLIC SU UNA RIGA PER VEDERE COSA È STATO FATTO O AGGIORNARLO
          </p>
          <LogTable
            logs={filteredLogs}
            limit={logLimit}
            onMore={() => setLogLimit(n => n + 50)}
            onOpen={setOpenLog}
            empty={allLogs.length
              ? { text: 'Nessun intervento corrisponde ai filtri', hint: 'Cambia filtro o ricerca.' }
              : { text: 'Nessun intervento registrato', hint: 'Registra il primo da un piano o con Registra intervento.' }}
          />
        </>
      )}

      {/* ═══ Pannello del piano ═══ */}
      {selectedTask && (
        <PlanDrawer
          key={selectedTask.plan.id}
          task={selectedTask}
          recentLogs={recentMachineLogs}
          durationStats={durationStats}
          blocked={Boolean(openLog || showPlanForm || showLogForm || showCSV)}
          onClose={closeDrawer}
          onRegister={registerPlan}
          onOpenLog={setOpenLog}
          onFullForm={(task) => openLogForm(task)}
          onEdit={(plan) => openPlanForm(plan)}
          onDuplicate={(plan) => openPlanForm(plan, { duplicate: true })}
          onDelete={deletePlan}
        />
      )}

      {/* ═══ Intervento registrato ═══ */}
      {openLog && (
        <MaintenanceLogModal key={openLog.id} log={openLog}
          onClose={() => setOpenLog(null)} onChanged={handleLogChanged} />
      )}

      {/* ═══ Plan Form ═══ */}
      <Modal open={showPlanForm} onClose={() => setShowPlanForm(false)} title={editingPlan ? 'Modifica Piano' : 'Nuovo Piano'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Macchinario *</label>
            <select value={planForm.machine_id} onChange={async e => {
              const mid = e.target.value
              setPlanForm(f => ({ ...f, machine_id: mid, component_id: '' }))
              if (mid) {
                try { setPlanComponents(await db.getMachineComponents(mid)) } catch { setPlanComponents([]) }
              } else { setPlanComponents([]) }
            }}
              className="w-full input-field rounded-xl px-3 py-2.5 text-sm" disabled={!!editingPlan}>
              <option value="">Seleziona macchinario</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}{m.department ? ` — ${m.department}` : ''}</option>)}
            </select>
          </div>
          {/* Il piano resta della macchina: scadenze e semaforo non cambiano.
              Il pezzo dice solo su cosa si interviene — e il log confermato
              lo eredita, popolando lo storico del componente da solo. */}
          {planComponents.length > 0 && (
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Componente</label>
              <select value={planForm.component_id || ''} onChange={e => setPlanForm(f => ({ ...f, component_id: e.target.value }))}
                className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
                <option value="">Intero macchinario</option>
                {planComponents.map(c => <option key={c.id} value={c.id}>{c.name}{c.type ? ` (${c.type})` : ''}</option>)}
              </select>
            </div>
          )}
          <Input label="Attività *" placeholder="Lubrificazione cuscinetti" value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} />
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Frequenza</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {FREQ_PRESETS.map(p => <button key={p.days} onClick={() => setPlanForm(f => ({ ...f, frequency_days: p.days }))}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${parseInt(planForm.frequency_days) === p.days ? 'bg-violet-600 text-white' : 'bg-surface-2 text-muted'}`}>{p.label}</button>)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-faint">Ogni</span>
              <input type="number" value={planForm.frequency_days} onChange={e => setPlanForm(f => ({ ...f, frequency_days: e.target.value }))} className="w-20 input-field rounded-xl px-3 py-2 text-sm text-center" />
              <span className="text-sm text-faint">giorni</span>
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Responsabile</label>
            <select value={planForm.assigned_to} onChange={e => setPlanForm(f => ({ ...f, assigned_to: e.target.value }))} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
              <option value="">Non assegnato</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <Textarea label="Istruzioni" placeholder="Come eseguire..." value={planForm.instructions} onChange={e => setPlanForm(f => ({ ...f, instructions: e.target.value }))} />
          <Button onClick={savePlan} className="w-full" size="lg" disabled={!planForm.name.trim() || !planForm.machine_id}>{editingPlan ? 'Salva' : 'Crea Piano'}</Button>
        </div>
      </Modal>

      {/* ═══ Log Form ═══ */}
      <Modal open={showLogForm} onClose={() => setShowLogForm(false)} title="Registra Intervento" size="md">
        {/* gap e non space-y: il reset globale annulla i margini (debito tecnico) */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Macchinario *</label>
            <select value={logForm.machine_id} onChange={async e => {
              const mid = e.target.value
              setLogForm(f => ({ ...f, machine_id: mid, component_id: '' }))
              if (mid) {
                try { setLogComponents(await db.getMachineComponents(mid)) } catch { setLogComponents([]) }
              } else { setLogComponents([]) }
            }} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
              <option value="">Seleziona</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {logComponents.length > 0 && (
            <div>
              <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Componente</label>
              <select value={logForm.component_id || ''} onChange={e => setLogForm(f => ({ ...f, component_id: e.target.value || '' }))}
                className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
                <option value="">Intero macchinario</option>
                {logComponents.map(c => <option key={c.id} value={c.id}>{c.name}{c.type ? ` (${c.type})` : ''}</option>)}
              </select>
            </div>
          )}
          <Input label="Titolo *" placeholder="Lubrificazione completata" value={logForm.title} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea label="Descrizione" placeholder="Cosa è stato fatto..." value={logForm.description} onChange={e => setLogForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Durata (min)" placeholder="60" type="number" value={logForm.duration_minutes} onChange={e => setLogForm(f => ({ ...f, duration_minutes: e.target.value }))} />
            <Input label="Ricambi" placeholder="Filtro XF-420" value={logForm.parts_replaced} onChange={e => setLogForm(f => ({ ...f, parts_replaced: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] text-faint uppercase tracking-wider" style={{ marginBottom: 6 }}>Foto e documenti</label>
            <LogAttachmentsPicker
              machineId={logForm.machine_id}
              media={logForm.media}
              onChange={update => setLogForm(f => ({ ...f, media: update(f.media) }))}
              onBusyChange={setLogAttaching}
            />
          </div>
          {logForm.plan_id ? <p className="text-xs text-violet-400 bg-violet-500/10 rounded-xl px-3 py-2">✓ Manutenzione programmata</p>
            : <p className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">⚡ Manutenzione straordinaria</p>}
          <Button onClick={saveLog} className="w-full" size="lg" disabled={logAttaching || !logForm.title.trim() || !logForm.machine_id}>Registra</Button>
        </div>
      </Modal>

      {/* ═══ CSV Import ═══ */}
      <Modal open={showCSV} onClose={() => setShowCSV(false)} title="Importa Piani da CSV" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-muted">Trovati <strong className="text-white">{csvData.length}</strong> piani.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Macchinario *</label>
              <select value={csvMachine} onChange={e => setCsvMachine(e.target.value)} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
                <option value="">Seleziona</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Responsabile default</label>
              <select value={csvUser} onChange={e => setCsvUser(e.target.value)} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
                <option value="">Non assegnato</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
          </div>
          <div className="bg-surface-2 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full">
              <thead><tr className="border-b border-token"><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Attività</th><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Freq.</th><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Note</th></tr></thead>
              <tbody>{csvData.map((r, i) => <tr key={i} className="border-b border-token/30"><td className="px-4 py-2 text-sm text-themed">{r.name}</td><td className="px-4 py-2 text-sm text-muted">{r.frequency_days}g</td><td className="px-4 py-2 text-sm text-faint truncate max-w-[200px]">{r.instructions||'—'}</td></tr>)}</tbody>
            </table>
          </div>
          <Button onClick={importCSV} className="w-full" size="lg" disabled={!csvData.length || !csvMachine}><Upload size={16} /> Importa {csvData.length} piani</Button>
        </div>
      </Modal>
    </div>
  )
}

/**
 * PlantMap — la planimetria dello stabilimento con un punto per macchina.
 *
 * Tre livelli: stabilimento → area → macchina. Il colore del punto dice i
 * ticket aperti (verde nessuno, ambra aperti, rosso con gravità alta o
 * critica); il tratteggio dice che la posizione è una stima da verificare.
 * Chi può (admin e tecnici) passa a «Posiziona» e trascina i punti sulla
 * macchina vera, o mette sulla mappa quelle che mancano. Gli admin hanno
 * anche «Aree»: correggono il contorno di un'area trascinandone i vertici,
 * o ne creano una nuova. Il contorno si salva sull'area (`areas.map_shape`).
 *
 * Stesso componente su desktop (pannello a destra) e telefono (foglio dal
 * basso): decide la larghezza del contenitore, non il dispositivo.
 * Disegno dal prototipo "Mappa impianto Amarcord" (claude.ai, ott 2026).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Minus, Maximize2, Layers, Search, RefreshCw, MapPin, Undo2, Eraser, SquarePlus, SquareMinus } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { formatTime } from '../../lib/constants'
import { getTrafficLight } from '../../lib/maintenanceStatus'
import { machineMapPosition, isMapOpenReport, mapStatus } from '../../lib/plantMap'
import { AREA_MAP_COLORS, areaMapColor, buildMapAreas, keepOrPlaceLabel, pointInShape, rectInView } from '../../lib/plantMap/areas'
import { createMapEngine } from './mapEngine'
import PlantMapPanel from './PlantMapPanel'

const NO_AREA = 'Senza area'
const NARROW = 760

// Dove eri rimasto: aprendo una macchina si cambia pagina, tornando la
// mappa riparte da lì invece che dalla vista d'insieme.
const lastViews = new Map()

function luminanceOf(el) {
  const v = el ? getComputedStyle(el).getPropertyValue('--color-bg').trim() : ''
  const m = /^#?([0-9a-f]{6})$/i.exec(v)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

function CtrlButton({ onClick, label, pressed, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={pressed}
      style={{
        width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', cursor: 'pointer',
        border: `1px solid ${pressed ? 'var(--color-primary)' : 'var(--color-border-hover)'}`,
        background: pressed ? 'var(--color-primary)' : 'var(--glass-bg, var(--color-surface-elevated))',
        color: pressed ? '#fff' : 'var(--color-text)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}>
      {children}
    </button>
  )
}

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--color-border-hover)', borderRadius: 9, padding: 2, background: 'var(--color-surface-1)' }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} style={{
          border: 0, height: 28, padding: '0 10px', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          background: value === v ? 'var(--color-primary)' : 'none',
          color: value === v ? '#fff' : 'var(--color-text-muted)', fontWeight: value === v ? 500 : 400,
        }}>{label}</button>
      ))}
    </div>
  )
}

export default function PlantMap({
  plant, data, canEdit = false, canEditAreas = false, onOpenMachine, onOpenReport,
  monoFont = "'JetBrains Mono', ui-monospace, monospace",
}) {
  const toast = useToast()
  const saved = lastViews.get(plant.id)

  const [focus, setFocus] = useState(saved?.focus ?? null)
  const [sel, setSel] = useState(saved?.sel ?? null) // { kind: 'm' | 'p', id }
  const [mode, setModeState] = useState('view')
  const [showProject, setShowProject] = useState(saved?.showProject ?? true)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [trayOpen, setTrayOpen] = useState(false)
  const [placing, setPlacing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [dark, setDark] = useState(true)
  const [query, setQuery] = useState('')
  const [qOpen, setQOpen] = useState(false)
  const [qSel, setQSel] = useState(0)
  // Contorno in modifica in «Aree»: { key, id (null = area nuova), name,
  // colorHex, polys, selV: [pezzo, vertice] | null, history, dirty }
  const [shapeEdit, setShapeEdit] = useState(null)
  const [areaSaving, setAreaSaving] = useState(false)

  const rootRef = useRef(null)
  const stageRef = useRef(null)
  const cadRef = useRef(null)
  const projRef = useRef(null)
  const areasGRef = useRef(null)
  const marksRef = useRef(null)
  const scaleRef = useRef(null)
  const coordRef = useRef(null)
  const panelRef = useRef(null)
  const editbarRef = useRef(null)
  const pcRef = useRef(null)
  const engineRef = useRef(null)
  const handlersRef = useRef({})

  const areaColor = useCallback((a) => (dark ? a.color.dark : a.color.light), [dark])

  // ── aree ───────────────────────────────────────────────────────────
  // Le aree di ManuTech col loro contorno; la chiave è l'id dell'area.
  const mapAreas = useMemo(() => buildMapAreas(plant, data.areas), [plant, data.areas])
  const areaByKey = useMemo(() => new Map(mapAreas.map(a => [a.key, a])), [mapAreas])
  // Quello che disegna il motore: l'area in modifica col nome e il colore
  // della bozza, e l'area nuova che ancora non c'è.
  const engineAreas = useMemo(() => {
    if (!shapeEdit) return mapAreas
    const live = { name: shapeEdit.name.trim() || 'Nuova area', color: areaMapColor(shapeEdit.colorHex) }
    const list = mapAreas.map(a => (a.key === shapeEdit.key ? { ...a, ...live } : a))
    if (!areaByKey.has(shapeEdit.key)) list.push({ key: shapeEdit.key, id: null, polys: [], label: null, ...live })
    return list
  }, [mapAreas, areaByKey, shapeEdit])
  const shapeKey = shapeEdit?.key, shapePolys = shapeEdit?.polys, shapeSelV = shapeEdit?.selV
  const engineShape = useMemo(() => (shapeKey ? { key: shapeKey, polys: shapePolys, selV: shapeSelV } : null), [shapeKey, shapePolys, shapeSelV])
  const nameOfArea = (key) => (key === NO_AREA ? 'Senza area' : areaByKey.get(key)?.name || (shapeEdit?.key === key ? (shapeEdit.name.trim() || 'Nuova area') : key))

  // ── dati per macchina ──────────────────────────────────────────────
  const infos = useMemo(() => {
    const areaName = new Map(data.areas.map(a => [a.id, a.name]))
    const mapKeys = new Set(mapAreas.map(a => a.key))
    const idByName = new Map(data.machines.map(m => [m.name, m.id]))
    const reportsBy = new Map()
    for (const r of data.reports) {
      if (r.duplicate_of_id) continue
      const id = r.machine_id || idByName.get(r.machine)
      if (!id) continue
      if (!reportsBy.has(id)) reportsBy.set(id, [])
      reportsBy.get(id).push(r)
    }
    const plansBy = new Map()
    for (const p of data.plans) {
      if (!plansBy.has(p.machine_id)) plansBy.set(p.machine_id, [])
      plansBy.get(p.machine_id).push(p)
    }
    const LIGHT_ORDER = { overdue: 0, warning: 1, ok: 2 }
    return data.machines.map(m => {
      const reps = reportsBy.get(m.id) || []
      const openReports = reps.filter(isMapOpenReport).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      const lastReportAt = reps.reduce((d, r) => (!d || new Date(r.created_at) > new Date(d) ? r.created_at : d), null)
      const an = areaName.get(m.area_id) || null
      const plans = (plansBy.get(m.id) || [])
        .map(plan => ({ plan, light: getTrafficLight(plan, data.lastLogs[plan.id]) }))
        .sort((a, b) => LIGHT_ORDER[a.light.status] - LIGHT_ORDER[b.light.status] || a.light.daysLeft - b.light.daysLeft)
      return {
        id: m.id, machine: m, name: m.name || 'Senza nome',
        areaName: an, areaKey: m.area_id && mapKeys.has(m.area_id) ? m.area_id : NO_AREA,
        pos: machineMapPosition(m), openReports, status: mapStatus(openReports),
        totReports: reps.length, lastReportAt, plans,
      }
    })
  }, [data.machines, data.areas, data.reports, data.plans, data.lastLogs, mapAreas])

  const areaStats = useMemo(() => {
    const st = new Map()
    for (const i of infos) {
      const s = st.get(i.areaKey) || { n: 0, open: 0 }
      s.n += 1
      s.open += i.openReports.length
      st.set(i.areaKey, s)
    }
    return st
  }, [infos])

  const noArea = useMemo(() => {
    const list = infos.filter(i => i.areaKey === NO_AREA)
    return { key: NO_AREA, list }
  }, [infos])

  const items = useMemo(() => infos.filter(i => i.pos).map(i => ({
    id: i.id, name: i.name, areaKey: i.areaKey, x: i.pos.x, y: i.pos.y,
    estimated: i.pos.estimated, status: i.status, openCount: i.openReports.length,
  })), [infos])

  const unplaced = useMemo(() => infos.filter(i => !i.pos).sort((a, b) => a.name.localeCompare(b.name)), [infos])
  const selInfo = sel?.kind === 'm' ? infos.find(i => i.id === sel.id) : null

  // ── navigazione ────────────────────────────────────────────────────
  const engine = () => engineRef.current
  const openSheet = () => setCollapsed(false)

  const focusArea = (key) => {
    setFocus(key); setSel(null); setTrayOpen(false)
    if (plant.projectArea && key === plant.projectArea.key) setShowProject(true)
    openSheet()
    engine()?.focusArea(key)
  }
  const selectMachine = (id) => {
    const info = infos.find(i => i.id === id)
    if (!info) return
    setSel({ kind: 'm', id }); setTrayOpen(false); setFocus(info.areaKey); openSheet()
    if (info.pos) engine()?.showPoint(info.pos.x, info.pos.y)
  }
  const selectProject = (n) => {
    const p = plant.projectArea?.positions.find(x => x.n === n)
    if (!p) return
    setSel({ kind: 'p', id: n }); setFocus(plant.projectArea.key); setShowProject(true); openSheet()
    engine()?.showPoint(p.x, p.y, 9000)
  }
  const back = () => {
    if (shapeEdit) { if (shapeEdit.selV) selectVertex(null); else leaveShape(); return }
    if (trayOpen) setTrayOpen(false)
    else if (sel) setSel(null)
    else if (focus) { setFocus(null); engine()?.fit() }
  }
  const goHome = () => {
    if (shapeEdit && !leaveShape()) return
    setSel(null); setFocus(null); setTrayOpen(false); engine()?.fit()
  }
  const setMode = (m) => {
    if (m === mode) return
    if (shapeEdit && !leaveShape()) return
    setModeState(m)
    if (m !== 'edit') { setTrayOpen(false); setPlacing(null) }
    if (m === 'areas' || mode === 'areas') { setSel(null); setFocus(null) }
  }

  // ── aree: modifica del contorno ────────────────────────────────────
  // Lasciare una bozza non salvata chiede conferma.
  const leaveShape = () => {
    if (shapeEdit?.dirty && !window.confirm(`Uscire senza salvare le modifiche a «${nameOfArea(shapeEdit.key)}»?`)) return false
    setShapeEdit(null); setFocus(null)
    return true
  }
  const freePiece = () => rectInView(engine()?.viewBox() || plant.fit)
  const editArea = (key) => {
    if (plant.projectArea && key === plant.projectArea.key) {
      toast.info('La linea lenta viene dal layout Beertec: non si modifica dalla mappa')
      return
    }
    if (shapeEdit?.key === key) { selectVertex(null); return }
    if (shapeEdit?.dirty) { toast.error(`Salva o annulla prima le modifiche a «${nameOfArea(shapeEdit.key)}»`); return }
    const a = areaByKey.get(key)
    if (!a) return
    // Un'area senza contorno parte da un rettangolo nel mezzo della vista.
    const polys = a.polys.length ? a.polys.map(p => p.map(([x, y]) => [x, y])) : [freePiece()]
    setShapeEdit({ key, id: a.id, name: a.name, colorHex: a.colorHex, polys, selV: null, history: [], dirty: !a.polys.length })
    setFocus(key); setSel(null); openSheet()
    if (a.polys.length) engine()?.focusArea(key)
    else engine()?.showPolys(polys)
  }
  const newArea = () => {
    if (shapeEdit?.dirty) { toast.error(`Salva o annulla prima le modifiche a «${nameOfArea(shapeEdit.key)}»`); return }
    const used = new Set(mapAreas.map(a => (a.colorHex || '').toLowerCase()))
    const color = (AREA_MAP_COLORS.find(c => !used.has(c.dark)) || AREA_MAP_COLORS[0]).dark
    const key = 'new:' + Date.now()
    const polys = [freePiece()]
    setShapeEdit({ key, id: null, name: '', colorHex: color, polys, selV: null, history: [], dirty: true })
    setFocus(key); setSel(null); openSheet()
    engine()?.showPolys(polys)
  }
  // Ogni modifica al contorno passa di qui: tiene la storia per «Annulla ultima».
  const changePolys = (polys, selV = null) => setShapeEdit(e => e && ({ ...e, polys, selV, history: [...e.history, e.polys].slice(-60), dirty: true }))
  function selectVertex(selV) { setShapeEdit(e => (e ? { ...e, selV } : e)) }
  const undoShape = () => setShapeEdit(e => (e?.history.length ? { ...e, polys: e.history[e.history.length - 1], history: e.history.slice(0, -1), selV: null, dirty: true } : e))
  const removeVertex = () => {
    const [pi, vi] = shapeEdit?.selV || []
    if (pi == null) return
    const p = shapeEdit.polys[pi]
    if (p.length <= 3) { toast.error('Un pezzo ha almeno 3 vertici: per toglierlo usa «Togli pezzo»'); return }
    changePolys(shapeEdit.polys.map((q, i) => (i === pi ? q.filter((_, j) => j !== vi) : q)))
  }
  const addPiece = () => changePolys([...shapeEdit.polys, freePiece()])
  const removePiece = () => {
    const pi = shapeEdit?.selV?.[0]
    if (pi == null) { toast.info('Tocca un vertice del pezzo da togliere'); return }
    changePolys(shapeEdit.polys.filter((_, i) => i !== pi))
  }
  const saveShape = async () => {
    const e = shapeEdit
    const name = e.name.trim()
    if (!name) { toast.error("Dai un nome all'area"); return }
    if (mapAreas.some(a => a.key !== e.key && a.id && a.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.error(`Esiste già un'area «${name}»`)
      return
    }
    const prev = areaByKey.get(e.key)
    const polys = e.polys.filter(p => p.length >= 3).map(p => p.map(([x, y]) => [Math.round(x), Math.round(y)]))
    const map_shape = { polys, label: keepOrPlaceLabel(prev?.label, polys) }
    setAreaSaving(true)
    try {
      // Il colore si salva sempre: è quello che si vede sulla mappa, e da
      // qui vale anche in Macchinari.
      if (e.id) await data.saveArea(e.id, { name, color: e.colorHex, map_shape })
      else await data.saveArea(null, { name, color: e.colorHex, sort_order: data.areas.length, map_shape })
      toast.success(e.id ? `Area «${name}» salvata` : `Area «${name}» creata`)
      setShapeEdit(null); setFocus(null)
    } catch (err) {
      toast.error(err?.message || 'Salvataggio non riuscito. Riprova tra poco.')
    } finally {
      setAreaSaving(false)
    }
  }

  // Come sta il contorno rispetto alle macchine: chi dell'area resta fuori,
  // chi di un'altra area ci cade dentro. È il controllo che serve davvero.
  const shapeCheck = useMemo(() => {
    if (!shapeEdit) return null
    const outside = [], foreign = []
    for (const i of infos) {
      if (!i.pos) continue
      const inside = pointInShape(i.pos.x, i.pos.y, shapeEdit.polys)
      if (i.areaKey === shapeEdit.key && !inside) outside.push(i)
      else if (i.areaKey !== shapeEdit.key && inside) foreign.push(i)
    }
    return { outside, foreign }
  }, [shapeEdit, infos])

  const save = async (id, point) => {
    setSaving(true)
    try {
      await data.savePosition(id, point)
      toast.success(point ? 'Posizione salvata' : 'Posizione confermata')
      // Di norma il punto si sgancia quando arrivano le coordinate nuove;
      // questo copre il caso in cui tornano uguali a prima.
      setTimeout(() => engine()?.clearDrag(id), 400)
    } catch (e) {
      engine()?.clearDrag(id)
      toast.error(e?.message || 'Salvataggio non riuscito. Riprova tra poco.')
    } finally {
      setSaving(false)
    }
  }
  const startPlacing = (id) => {
    if (mode !== 'edit') setModeState('edit')
    setPlacing(id)
    const name = infos.find(i => i.id === id)?.name || 'la macchina'
    toast.info(`Tocca la mappa nel punto in cui si trova ${name}`)
  }
  const confirmPos = (id) => save(id, null)

  handlersRef.current = {
    selectMachine, selectProject,
    focusArea: (key) => {
      if (mode === 'areas') editArea(key)
      else if (key !== focus) focusArea(key)
      else if (sel) setSel(null)
    },
    dragEnd: (id, p) => { if (p) save(id, p) },
    place: (id, p) => { setPlacing(null); setTrayOpen(false); setSel({ kind: 'm', id }); save(id, p) },
    shapeChange: (polys, selV) => changePolys(polys, selV),
    selectVertex,
  }

  // ── motore ─────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (name) => (...args) => handlersRef.current[name]?.(...args)
    const eng = createMapEngine({
      stage: stageRef.current, cad: cadRef.current, proj: projRef.current,
      areasG: areasGRef.current, marks: marksRef.current,
      hud: { scale: scaleRef.current, coord: coordRef.current },
      plant, monoFont,
      on: {
        selectMachine: h('selectMachine'), selectProject: h('selectProject'), focusArea: h('focusArea'),
        dragEnd: h('dragEnd'), place: h('place'), shapeChange: h('shapeChange'), selectVertex: h('selectVertex'),
      },
    })
    engineRef.current = eng
    const prev = lastViews.get(plant.id)
    if (prev?.view) eng.setView(prev.view)
    return () => {
      lastViews.set(plant.id, { ...(lastViews.get(plant.id) || {}), view: eng.getView() })
      eng.destroy()
      engineRef.current = null
    }
  }, [plant, monoFont])

  useEffect(() => {
    lastViews.set(plant.id, { ...(lastViews.get(plant.id) || {}), focus, sel, showProject })
  }, [plant.id, focus, sel, showProject])

  useEffect(() => {
    engineRef.current?.update({
      items, areaStats, focus, sel, mode, showProject, onlyOpen, placing, canEdit, compact: narrow,
      areas: engineAreas, shape: mode === 'areas' ? engineShape : null,
    })
  }, [items, areaStats, focus, sel, mode, showProject, onlyOpen, placing, canEdit, narrow, engineAreas, engineShape])

  // Sul telefono si parte con il foglio chiuso: prima la planimetria, il
  // pannello si apre da solo appena si sceglie un'area o una macchina.
  const sheetInit = useRef(false)
  useEffect(() => {
    if (!narrow || sheetInit.current) return
    sheetInit.current = true
    if (!sel && !focus) setCollapsed(true)
  }, [narrow, sel, focus])

  // Larghezza del contenitore → pannello a destra o foglio dal basso.
  // Il tema si legge dallo sfondo vero: la console è scura comunque.
  useEffect(() => {
    const el = rootRef.current
    const ro = new ResizeObserver(() => {
      setNarrow(el.getBoundingClientRect().width < NARROW)
      setDark(luminanceOf(el) < 0.5)
    })
    ro.observe(el)
    const mo = new MutationObserver(() => setDark(luminanceOf(el) < 0.5))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])

  // Quello che copre la planimetria (foglio in basso, barra di Posiziona in
  // alto) non conta per centrare la vista.
  useEffect(() => {
    const upd = () => {
      const b = narrow && panelRef.current ? panelRef.current.offsetHeight : 0
      const t = editbarRef.current ? editbarRef.current.offsetHeight + 12 : 0
      engineRef.current?.setInsets({ b, t })
    }
    upd()
    const ro = new ResizeObserver(upd)
    if (panelRef.current) ro.observe(panelRef.current)
    if (editbarRef.current) ro.observe(editbarRef.current)
    return () => ro.disconnect()
  }, [narrow, mode, collapsed])

  const panelView = mode === 'areas' ? (shapeEdit ? 'areaEdit' : 'areas')
    : trayOpen && mode === 'edit' ? 'tray' : sel?.kind === 'p' ? 'project' : selInfo ? 'machine' : focus ? 'area' : 'overview'
  useEffect(() => { if (pcRef.current && (sel || panelView === 'areaEdit')) pcRef.current.scrollTop = 0 }, [sel, panelView])

  // ── ricerca ────────────────────────────────────────────────────────
  const results = useMemo(() => {
    const t = query.trim().toLowerCase()
    if (!t) return []
    const out = []
    for (const a of mapAreas) {
      if (a.name.toLowerCase().includes(t)) out.push({ k: 'a' + a.key, t: a.name, s: 'area', go: () => (mode === 'areas' ? editArea(a.key) : focusArea(a.key)) })
    }
    for (const i of infos) {
      const m = i.machine
      const hay = [i.name, m.manufacturer, m.model, m.department, m.serial_number].filter(Boolean).join(' ').toLowerCase()
      if (hay.includes(t)) out.push({ k: 'm' + i.id, t: i.name, s: i.pos ? (i.areaName || 'senza area') : 'non sulla mappa', dot: i.status, go: () => selectMachine(i.id) })
    }
    for (const p of plant.projectArea?.positions || []) {
      if ((p.original + ' ' + p.name).toLowerCase().includes(t)) out.push({ k: 'p' + p.n, t: p.name, s: 'linea lenta ' + p.n, go: () => selectProject(p.n) })
    }
    return out.slice(0, 12)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, infos, plant, mapAreas, mode])
  const pick = (i) => {
    const it = results[i]
    if (!it) return
    setQuery(''); setQOpen(false)
    it.go()
  }

  const onKeyDown = (e) => {
    if (e.target.closest?.('input,textarea')) return
    if (shapeEdit && (e.key === 'Delete' || e.key === 'Backspace') && shapeEdit.selV) { e.preventDefault(); removeVertex(); return }
    if (shapeEdit && e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undoShape(); return }
    if (e.key === 'Escape') {
      if (placing) { setPlacing(null); return }
      back()
    } else if (e.key === '+' || e.key === '=') engine()?.zoom(1.4)
    else if (e.key === '-') engine()?.zoom(1 / 1.4)
  }

  // ── briciole ───────────────────────────────────────────────────────
  const crumbs = [{ label: 'Stabilimento', go: goHome }]
  if (mode === 'areas') crumbs.push({ label: 'Aree', go: null })
  if (focus) crumbs.push({ label: nameOfArea(focus), go: () => { setSel(null); setTrayOpen(false); engine()?.focusArea(focus) } })
  if (sel) crumbs.push({ label: sel.kind === 'm' ? (selInfo?.name || '') : `Pos. ${sel.id}`, go: null })

  const placingName = placing ? (infos.find(i => i.id === placing)?.name || 'la macchina') : null
  const statusVar = { ok: 'var(--color-green)', warn: 'var(--color-orange)', bad: 'var(--color-red)' }

  const selArea = selInfo ? areaByKey.get(selInfo.areaKey) : null
  const panelProps = {
    view: panelView, plant, areas: mapAreas, infos, areaStats, noArea, canEdit, canEditAreas, showProject, onlyOpen, focus, saving,
    loading: data.loading, mono: monoFont, areaColor, unplaced,
    info: selInfo, n: sel?.kind === 'p' ? sel.id : null,
    areaLabel: selInfo ? (selInfo.areaName || 'Senza area') : '',
    areaSwatch: selInfo ? (selArea ? areaColor(selArea) : 'var(--color-text-muted)') : null,
    onFocusArea: focusArea, onSelectMachine: selectMachine, onSelectProject: selectProject, onBack: back,
    onToggleProject: setShowProject, onToggleOnlyOpen: setOnlyOpen,
    onOpenMachine, onOpenReport,
    onConfirm: confirmPos, onReposition: startPlacing, onStartPlacing: startPlacing,
    onClose: () => setTrayOpen(false),
    // «Aree»
    edit: shapeEdit, shapeCheck, areaSaving,
    onEditArea: editArea, onNewArea: newArea, onSaveShape: saveShape, onCancelShape: leaveShape,
    onShapeName: (name) => setShapeEdit(e => e && ({ ...e, name, dirty: true })),
    onShapeColor: (colorHex) => setShapeEdit(e => e && ({ ...e, colorHex, dirty: true })),
    onDrawArea: canEditAreas ? (key) => { setModeState('areas'); setSel(null); setTrayOpen(false); setPlacing(null); editArea(key) } : null,
  }

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: narrow ? 8 : 10, color: 'var(--color-text)' }}>
      {/* barra: percorso, ricerca, dati, modalità */}
      <div style={{ display: 'flex', alignItems: 'center', gap: narrow ? 8 : 12, flexWrap: 'wrap', minHeight: 36 }}>
        {/* Sul telefono il percorso lo dice già il pannello, con la X per tornare */}
        <nav aria-label="Percorso" style={{ display: narrow ? 'none' : 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'contents' }}>
              {i > 0 && <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>›</span>}
              <button type="button" onClick={c.go || undefined} disabled={!c.go} style={{
                border: 0, background: 'none', padding: '4px 6px', borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240,
                color: i === crumbs.length - 1 ? 'var(--color-text)' : 'var(--color-text-muted)',
                fontWeight: i === crumbs.length - 1 ? 500 : 400, cursor: c.go ? 'pointer' : 'default',
              }}>{c.label}</button>
            </span>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', width: narrow ? '100%' : 'auto' }}>
          <div style={{ position: 'relative', flex: narrow ? 1 : 'none', minWidth: 0 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input type="search" value={query} placeholder="Cerca macchina" aria-label="Cerca macchina" autoComplete="off"
              onChange={e => { setQuery(e.target.value); setQOpen(true); setQSel(0) }}
              onFocus={() => setQOpen(true)}
              onBlur={() => setTimeout(() => setQOpen(false), 120)}
              onKeyDown={e => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setQSel(v => (v + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length)) }
                else if (e.key === 'Enter') { e.preventDefault(); pick(qSel) }
                else if (e.key === 'Escape') { setQOpen(false); e.currentTarget.blur() }
              }}
              style={{
                width: narrow ? '100%' : 230, height: 34, borderRadius: 9, border: '1px solid var(--color-border-hover)',
                background: 'var(--color-surface-1)', padding: '0 10px 0 32px', outline: 'none', color: 'var(--color-text)', fontSize: 14, fontFamily: 'inherit',
              }} />
            {qOpen && query.trim() && (
              <div style={{
                position: 'absolute', right: 0, top: 40, width: narrow ? '100%' : 300, maxHeight: 320, overflow: 'auto', zIndex: 30,
                background: 'var(--color-surface-1)', border: '1px solid var(--color-border-hover)', borderRadius: 10, padding: 4, boxShadow: 'var(--shadow-lg)',
              }}>
                {!results.length && <div style={{ padding: 10, color: 'var(--color-text-muted)', fontSize: 13 }}>Nessun risultato per «{query.trim()}».</div>}
                {results.map((it, i) => (
                  <button key={it.k} type="button" onMouseDown={e => { e.preventDefault(); pick(i) }} style={{
                    display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', border: 0, padding: '7px 8px', borderRadius: 7,
                    background: i === qSel ? 'var(--color-surface-2)' : 'none', color: 'var(--color-text)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {it.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: statusVar[it.dot] }} />}
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.t}</span>
                    <small style={{ color: 'var(--color-text-muted)', marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap' }}>{it.s}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => data.reload()} title="Aggiorna i dati di ManuTech" aria-label="Aggiorna" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 999, flex: 'none',
            border: '1px solid var(--color-border-hover)', background: 'var(--color-surface-1)', fontSize: 12, whiteSpace: 'nowrap',
            color: data.error ? 'var(--color-orange)' : 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <RefreshCw size={13} style={{ animation: data.refreshing ? 'gearSpin 1s linear infinite' : 'none' }} />
            {!narrow && (data.error ? 'Dati non aggiornati' : data.loadedAt ? `Aggiornato alle ${formatTime(data.loadedAt)}` : 'Caricamento…')}
          </button>
          {(canEdit || canEditAreas) && (
            <Segmented value={mode} onChange={setMode} options={[
              ['view', 'Esplora'],
              ...(canEdit ? [['edit', 'Posiziona']] : []),
              ...(canEditAreas ? [['areas', 'Aree']] : []),
            ]} />
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10, position: 'relative', flexDirection: narrow ? 'column' : 'row' }}>
        {/* planimetria */}
        <section ref={stageRef} tabIndex={0} aria-label="Planimetria dello stabilimento" style={{
          position: 'relative', flex: 1, minWidth: 0, minHeight: 0, borderRadius: narrow ? 12 : 14, overflow: 'hidden',
          background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)',
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'grab', outline: 'none',
        }}>
          <canvas ref={cadRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
          <canvas ref={projRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <g ref={areasGRef} />
          </svg>
          <div ref={marksRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

          {(mode === 'edit' || mode === 'areas') && (
            <div ref={editbarRef} data-map-ui="" style={{
              position: 'absolute', left: 12, top: 12, right: 58, zIndex: 7, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
              padding: narrow ? '6px 8px' : '8px 10px', borderRadius: 11, background: 'var(--glass-bg, var(--color-surface-elevated))',
              border: '1px solid var(--color-border-active)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', fontSize: 13,
            }}>
              {mode === 'areas' ? (
                shapeEdit ? (
                  <>
                    <p style={{ margin: 0, flex: '1 1 220px', minWidth: 0, color: 'var(--color-text-muted)', fontSize: narrow ? 12 : 13 }}>
                      {!narrow && <b style={{ color: 'var(--color-text)', fontWeight: 600 }}>{nameOfArea(shapeEdit.key)}. </b>}
                      {narrow ? 'Trascina i vertici; i tondini aggiungono un vertice.' : 'Trascina i quadratini per spostare i vertici, i tondini a metà lato per aggiungerne uno. I vertici si agganciano a quelli delle aree vicine.'}
                    </p>
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" onClick={undoShape} disabled={!shapeEdit.history.length} title="Annulla l'ultima modifica (Ctrl+Z)" aria-label="Annulla l'ultima modifica" style={{ ...editBtn, opacity: shapeEdit.history.length ? 1 : 0.45 }}><Undo2 size={13} /></button>
                      <button type="button" onClick={removeVertex} disabled={!shapeEdit.selV} title="Togli il vertice selezionato (Canc)" style={{ ...editBtn, opacity: shapeEdit.selV ? 1 : 0.45 }}><Eraser size={13} />{!narrow && ' Togli vertice'}</button>
                      <button type="button" onClick={addPiece} title="Aggiungi un pezzo all'area, nel mezzo della vista" style={editBtn}><SquarePlus size={13} />{!narrow && ' Aggiungi pezzo'}</button>
                      <button type="button" onClick={removePiece} disabled={!shapeEdit.selV} title="Togli il pezzo del vertice selezionato" style={{ ...editBtn, opacity: shapeEdit.selV ? 1 : 0.45 }}><SquareMinus size={13} />{!narrow && ' Togli pezzo'}</button>
                    </span>
                    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto' }}>
                      <button type="button" onClick={leaveShape} disabled={areaSaving} style={editBtn}>Annulla</button>
                      <button type="button" onClick={saveShape} disabled={areaSaving} style={{ ...editBtn, background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff', opacity: areaSaving ? 0.6 : 1 }}>
                        {areaSaving ? 'Salvo…' : 'Salva'}
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, flex: '1 1 220px', minWidth: 0, color: 'var(--color-text-muted)', fontSize: narrow ? 12 : 13 }}>
                      {!narrow && <b style={{ color: 'var(--color-text)', fontWeight: 600 }}>Modalità aree. </b>}
                      Tocca un'area per correggerne il contorno, o creane una nuova.
                    </p>
                    <button type="button" onClick={newArea} style={editBtn}><Plus size={13} /> Nuova area</button>
                  </>
                )
              ) : placing ? (
                <>
                  <p style={{ margin: 0, flex: '1 1 200px', minWidth: 0, color: 'var(--color-text-muted)', fontSize: narrow ? 12 : 13 }}>
                    Tocca la mappa nel punto in cui si trova <b style={{ color: 'var(--color-text)' }}>{placingName}</b>.
                  </p>
                  <button type="button" onClick={() => setPlacing(null)} style={editBtn}>Annulla</button>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, flex: '1 1 220px', minWidth: 0, color: 'var(--color-text-muted)', fontSize: narrow ? 12 : 13 }}>
                    {!narrow && <b style={{ color: 'var(--color-text)', fontWeight: 600 }}>Modalità posiziona. </b>}
                    Trascina un punto per spostarlo: la posizione si salva e vale per tutti.
                  </p>
                  <button type="button" onClick={() => { setTrayOpen(true); setSel(null); openSheet() }} style={editBtn}>
                    <MapPin size={13} /> Da posizionare <span style={{ fontFamily: monoFont }}>{unplaced.length}</span>
                  </button>
                </>
              )}
            </div>
          )}

          <div data-map-ui="" style={{ position: 'absolute', right: 12, top: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 6 }}>
            <CtrlButton label="Ingrandisci" onClick={() => engine()?.zoom(1.6)}><Plus size={15} /></CtrlButton>
            <CtrlButton label="Riduci" onClick={() => engine()?.zoom(1 / 1.6)}><Minus size={15} /></CtrlButton>
            <CtrlButton label="Tutto lo stabilimento" onClick={goHome}><Maximize2 size={14} /></CtrlButton>
            {plant.project && (
              <CtrlButton label={`${plant.projectLabel} (linea lenta)`} pressed={showProject} onClick={() => setShowProject(v => !v)}><Layers size={15} /></CtrlButton>
            )}
          </div>

          <div style={{
            // Sul telefono il foglio copre il fondo: la scala si vede solo col foglio chiuso.
            position: 'absolute', left: 12, bottom: narrow ? 68 : 12, display: 'flex', alignItems: 'flex-end', gap: 12, pointerEvents: 'none', zIndex: 6,
            visibility: narrow && !collapsed ? 'hidden' : 'visible',
          }}>
            <div ref={scaleRef} style={{ font: `500 11px ${monoFont}`, color: 'var(--color-text-muted)' }}>
              <div />
              <div style={{ height: 6, border: '1.5px solid var(--color-text-muted)', borderTop: 0, marginTop: 3 }} />
            </div>
            <div ref={coordRef} style={{ font: `400 11px ${monoFont}`, color: 'var(--color-text-faint)', whiteSpace: 'nowrap' }} />
          </div>
        </section>

        {/* pannello */}
        <aside ref={panelRef} style={narrow ? {
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
          maxHeight: collapsed ? 58 : '46%', borderRadius: '14px 14px 12px 12px',
          background: 'var(--glass-bg-heavy, var(--color-surface-1))', border: '1px solid var(--color-border)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', boxShadow: '0 -10px 30px rgba(0,0,0,.25)',
          transition: 'max-height .2s ease',
        } : {
          width: 360, flex: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, borderRadius: 14,
          background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
        }}>
          {narrow && (
            <button type="button" onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Espandi il pannello' : 'Riduci il pannello'}
              style={{ display: 'block', width: '100%', height: 18, border: 0, background: 'none', flex: 'none', position: 'relative', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', left: '50%', top: 7, width: 38, height: 4, borderRadius: 2, background: 'var(--color-border-hover)', transform: 'translateX(-50%)' }} />
            </button>
          )}
          <div ref={pcRef} style={{ flex: 1, minHeight: 0, overflow: collapsed && narrow ? 'hidden' : 'auto', padding: narrow ? '4px 14px 14px' : 16 }}>
            <PlantMapPanel {...panelProps} />
          </div>
        </aside>
      </div>
    </div>
  )
}

const editBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 8,
  border: '1px solid var(--color-border-hover)', background: 'var(--color-surface-2)', color: 'var(--color-text)',
  fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
}

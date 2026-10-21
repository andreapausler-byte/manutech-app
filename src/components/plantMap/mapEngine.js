// Motore della mappa impianto: disegna la planimetria su canvas e tiene a
// posto punti, etichette e chip delle aree mentre si trascina e si zooma.
//
// È imperativo apposta: durante un pan si ridisegna a ogni frame, e farlo
// passare da uno stato React rifarebbe il render di tutta la pagina 60
// volte al secondo. React gli passa i dati con `update()` e riceve le
// scelte dell'utente dalle callback `on.*`. Niente classi: una closure.
//
// Coordinate mondo = millimetri del disegno DWG, y verso l'alto.
//
// Le aree arrivano da React (`update({ areas })`), non dal disegno: gli
// admin ne correggono il contorno in modalità «Aree». Durante il
// trascinamento di un vertice la bozza vive qui (`draft`), e React la
// riceve solo a gesto finito con `on.shapeChange`.

import { closestOnSegment } from '../../lib/plantMap/areas'

const STATUS_COLOR = {
  ok: 'var(--color-green)',
  warn: 'var(--color-orange)',
  bad: 'var(--color-red)',
}

// Sopra questi zoom (px per mm) cambia cosa si vede.
const K_LABELS_ALL = 0.05     // etichette di tutte le macchine
const K_BIG_MARKERS = 0.022   // punti grandi anche fuori dall'area scelta
const K_AREA_CHIPS = 0.04     // oltre, i chip delle aree spariscono
const K_PROJECT = 0.012       // numeri della linea lenta
const K_PLACES = [0.009, 0.09]
const SNAP_PX = 10            // un vertice si aggancia a vertici e bordi entro tanti px
const SNAP_GRID = 50          // altrimenti ai 5 cm

const css = (el, styles) => { Object.assign(el.style, styles); return el }
const make = (tag, styles, text) => {
  const el = document.createElement(tag)
  if (styles) css(el, styles)
  if (text != null) el.textContent = text
  return el
}
// Scrive uno stile solo se cambia: a ogni frame si toccano decine di nodi.
const put = (el, key, value) => {
  if (!el._s) el._s = {}
  if (el._s[key] === value) return
  el._s[key] = value
  el.style[key] = value
}

function luminance(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec((color || '').trim())
  if (!m) {
    const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color || '')
    if (!rgb) return 0
    return (0.2126 * rgb[1] + 0.7152 * rgb[2] + 0.0722 * rgb[3]) / 255
  }
  const n = parseInt(m[1], 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

export function createMapEngine({ stage, cad, proj, areasG, marks, hud, plant, on, monoFont }) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const view = { k: 0.005, vx: 0, vy: 0 }
  let W = 1, H = 1, dpr = 1, kMin = 0.002, kMax = 0.32
  let insets = { t: 0, b: 0, r: 0 }
  let s = {
    items: [], areaStats: new Map(), focus: null, sel: null, mode: 'view',
    showProject: true, onlyOpen: false, placing: null, canEdit: false, compact: false,
    areas: [], shape: null, // shape = { key, polys, selV: [pezzo, vertice] | null }
  }
  const dragPos = new Map()
  const imgs = new Map()
  let colors = { line: 'rgba(200,210,205,.66)', proj: 'rgba(80,210,140,.85)', dark: true, stageBg: '#0b1710' }
  let raf = 0, anim = 0, destroyed = false, sized = false, restored = false
  const projectArea = plant.projectArea
  const projectEntry = projectArea ? { ...projectArea, name: projectArea.key, project: true } : null
  let allAreas = projectEntry ? [projectEntry] : []
  let draft = null // contorno in modifica: copia di s.shape.polys, mossa dai gesti
  const areaColor = (a) => (colors.dark ? a.color.dark : a.color.light)
  const clonePolys = (polys) => polys.map(p => p.map(([x, y]) => [x, y]))
  const polysOf = (a) => (s.shape && draft && a.key === s.shape.key ? draft : a.polys)

  // ── vista ─────────────────────────────────────────────────────────
  const toScreen = (x, y) => [(x - view.vx) * view.k + W / 2, (view.vy - y) * view.k + H / 2]
  const toWorld = (sx, sy) => [(sx - W / 2) / view.k + view.vx, view.vy - (sy - H / 2) / view.k]
  const fitK = (b, pad = 0.88) => Math.min((W - insets.r) / (b[2] - b[0]), Math.max(80, H - insets.t - insets.b) / (b[3] - b[1])) * pad
  function target(b, pad) {
    const k = Math.max(kMin, Math.min(kMax, fitK(b, pad)))
    const cy = insets.t + (H - insets.t - insets.b) / 2
    const cx = (W - insets.r) / 2
    return [k, (b[0] + b[2]) / 2 + (W / 2 - cx) / k, (b[1] + b[3]) / 2 + (cy - H / 2) / k]
  }
  function clampView() {
    const f = plant.fit
    view.k = Math.max(kMin, Math.min(kMax, view.k))
    view.vx = Math.max(f[0] - 20000, Math.min(f[2] + 20000, view.vx))
    view.vy = Math.max(f[1] - 20000, Math.min(f[3] + 20000, view.vy))
  }
  function setView(b, pad) { const [k, x, y] = target(b, pad); view.k = k; view.vx = x; view.vy = y; clampView() }
  function flyTo(b, pad) {
    const [k1, x1, y1] = target(b, pad)
    cancelAnimationFrame(anim)
    if (reduced) { setView(b, pad); schedule(); return }
    const k0 = view.k, x0 = view.vx, y0 = view.vy, t0 = performance.now(), D = 460
    const step = (t) => {
      if (destroyed) return
      let u = Math.min(1, (t - t0) / D)
      u = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
      view.k = Math.exp(Math.log(k0) + (Math.log(k1) - Math.log(k0)) * u)
      view.vx = x0 + (x1 - x0) * u
      view.vy = y0 + (y1 - y0) * u
      clampView(); frame()
      if (u < 1) anim = requestAnimationFrame(step)
    }
    anim = requestAnimationFrame(step)
  }
  function zoomAt(f, sx, sy) {
    const [wx, wy] = toWorld(sx, sy)
    view.k *= f; clampView()
    view.vx = wx - (sx - W / 2) / view.k
    view.vy = wy + (sy - H / 2) / view.k
    clampView(); schedule()
  }
  function areaBox(key) {
    const b = [Infinity, Infinity, -Infinity, -Infinity]
    const ext = (x, y) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) }
    const a = allAreas.find(x => x.key === key)
    if (a) polysOf(a).forEach(p => p.forEach(([x, y]) => ext(x, y)))
    if (a?.project) a.positions.forEach(p => ext(p.x, p.y))
    s.items.forEach(m => { if (m.areaKey === key) ext(m.x, m.y) })
    if (!isFinite(b[0])) return plant.fit
    const p = 3500
    return [b[0] - p, b[1] - p, b[2] + p, b[3] + p]
  }
  const pointBox = (x, y, r = 14000) => [x - r, y - r * 0.7, x + r, y + r * 0.7]
  function offView(x, y) {
    const [sx, sy] = toScreen(x, y)
    return sx < 40 || sx > W - insets.r - 40 || sy < insets.t + 40 || sy > H - insets.b - 40
  }

  // ── immagini ──────────────────────────────────────────────────────
  function getImg(src) {
    let o = imgs.get(src)
    if (!o) {
      o = { img: new Image(), ok: false, used: 0 }
      o.img.decoding = 'async'
      o.img.onload = () => { o.ok = true; schedule() }
      o.img.src = src
      imgs.set(src, o)
    }
    o.used = performance.now()
    return o
  }
  // Tiene in memoria al massimo 4 tasselli grandi: sul telefono 12 immagini
  // da 2-3 Mpx decodificate insieme fanno chiudere la scheda.
  function prune() {
    const now = performance.now()
    const tileSrc = new Set([...plant.base.tiles, ...(plant.project?.tiles || [])].map(t => t.src))
    const loaded = [...imgs.entries()].filter(([src, o]) => tileSrc.has(src) && o.ok)
    if (loaded.length <= 4) return
    loaded.sort((a, b) => a[1].used - b[1].used)
    for (const [src, o] of loaded.slice(0, loaded.length - 4)) {
      if (now - o.used > 8000) { o.img.src = ''; imgs.delete(src) }
    }
  }
  function drawLayer(cv, layer, color) {
    const ctx = cv.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * (W / 2 - view.vx * view.k), dpr * (H / 2 + view.vy * view.k))
    const lo = toWorld(0, H), hi = toWorld(W, 0)
    const visible = (r) => r[2] > lo[0] && r[0] < hi[0] && r[3] > lo[1] && r[1] < hi[1]
    const ov = getImg(layer.overview.src)
    const r0 = layer.overview.r
    if (ov.ok) ctx.drawImage(ov.img, r0[0], -r0[3], r0[2] - r0[0], r0[3] - r0[1])
    // I tasselli dettagliati solo quando la vista d'insieme si sgranerebbe.
    if (view.k * dpr * plant.overviewMmPerPx > 1.15) {
      for (const t of layer.tiles) {
        if (!visible(t.r)) continue
        const o = getImg(t.src)
        if (!o.ok) continue
        ctx.clearRect(t.r[0], -t.r[3], t.r[2] - t.r[0], t.r[3] - t.r[1])
        ctx.drawImage(o.img, t.r[0], -t.r[3], t.r[2] - t.r[0], t.r[3] - t.r[1])
      }
    }
    // Il disegno è una maschera: lo si colora col tema.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.globalCompositeOperation = 'source-over'
  }
  function readColors() {
    const cs = getComputedStyle(stage)
    const bg = cs.getPropertyValue('--color-bg').trim() || '#060e09'
    const dark = luminance(bg) < 0.5
    const text = cs.getPropertyValue('--color-text').trim() || (dark ? '#e8f5ee' : '#13201b')
    const m = /^#?([0-9a-f]{6})$/i.exec(text)
    const rgb = m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : (dark ? [198, 214, 206] : [30, 48, 41])
    const projHex = projectArea ? (dark ? projectArea.color.dark : projectArea.color.light) : '#4fd68f'
    const pm = /^#?([0-9a-f]{6})$/i.exec(projHex)
    const prgb = pm ? [parseInt(pm[1].slice(0, 2), 16), parseInt(pm[1].slice(2, 4), 16), parseInt(pm[1].slice(4, 6), 16)] : [79, 214, 143]
    colors = {
      dark,
      line: `rgba(${rgb.join(',')},${dark ? 0.62 : 0.78})`,
      proj: `rgba(${prgb.join(',')},0.88)`,
      stageBg: cs.getPropertyValue('--color-bg-subtle').trim() || bg,
    }
    buildAreas()
  }

  // ── aree (svg) ────────────────────────────────────────────────────
  const SVG = 'http://www.w3.org/2000/svg'
  const pathD = (p) => 'M' + p.map(([x, y]) => x + ' ' + (-y)).join('L') + 'Z'
  function makePath(a, p) {
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('d', pathD(p))
    path.setAttribute('fill', areaColor(a))
    path.setAttribute('stroke', areaColor(a))
    path.setAttribute('vector-effect', 'non-scaling-stroke')
    if (a.project) path.setAttribute('stroke-dasharray', '6 4')
    path.style.cursor = 'pointer'
    path.style.pointerEvents = 'auto'
    path.style.transition = 'fill-opacity .2s, stroke-opacity .2s'
    return path
  }
  function buildAreas() {
    areasG.replaceChildren()
    for (const a of allAreas) {
      const g = document.createElementNS(SVG, 'g')
      g.dataset.area = a.key
      for (const p of polysOf(a)) g.append(makePath(a, p))
      areasG.append(g)
    }
  }
  // Il contorno in modifica si ridisegna a ogni frame dalla bozza.
  function syncDraft() {
    if (!s.shape || !draft) return
    const g = [...areasG.children].find(x => x.dataset.area === s.shape.key)
    const a = allAreas.find(x => x.key === s.shape.key)
    if (!g || !a) return
    while (g.children.length > draft.length) g.lastChild.remove()
    while (g.children.length < draft.length) g.append(makePath(a, draft[g.children.length]))
    draft.forEach((p, i) => { const d = pathD(p); if (g.children[i].getAttribute('d') !== d) g.children[i].setAttribute('d', d) })
  }
  function setAreaList(list) {
    allAreas = projectEntry ? [...list, projectEntry] : list
    for (const [k, e] of acEls) if (!allAreas.some(a => a.key === k)) { e.remove(); acEls.delete(k) }
    buildAreas()
  }
  function styleAreas() {
    const editing = s.mode === 'areas'
    for (const g of areasG.children) {
      const key = g.dataset.area
      const a = allAreas.find(x => x.key === key)
      const on = key === s.focus
      const isEd = editing && s.shape?.key === key
      const hidden = a?.project && (editing || (!s.showProject && s.focus !== key))
      g.style.display = hidden ? 'none' : ''
      for (const p of g.children) {
        const fo = editing ? (s.shape ? (isEd ? 0.16 : 0.05) : 0.12) : s.focus ? (on ? 0.07 : 0.03) : 0.10
        const so = editing ? (s.shape ? (isEd ? 1 : 0.35) : 0.85) : s.focus ? (on ? 0.9 : 0.25) : 0.75
        p.setAttribute('fill-opacity', String(fo))
        p.setAttribute('stroke-opacity', String(so))
        p.setAttribute('stroke-width', isEd ? '2.5' : on ? '2' : '1.5')
      }
    }
  }

  // ── punti, chip, etichette (DOM) ──────────────────────────────────
  const mkEls = new Map(), pkEls = new Map(), acEls = new Map(), plEls = []
  const glass = 'var(--glass-bg, var(--color-surface-elevated))'
  const labelBase = {
    position: 'absolute', padding: '2px 7px', borderRadius: '6px', background: glass,
    border: '1px solid var(--color-border)', fontSize: '12px', fontWeight: '500', lineHeight: '18px',
    whiteSpace: 'nowrap', color: 'var(--color-text)', pointerEvents: 'none',
    backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
  }
  function placeLabel(lb, side, r) {
    const gap = (r + 6) + 'px'
    const reset = { left: 'auto', right: 'auto', top: 'auto', bottom: 'auto', margin: '0' }
    if (side === 'r') css(lb, { ...reset, left: '50%', top: '50%', marginLeft: gap, transform: 'translateY(-50%)' })
    else if (side === 'l') css(lb, { ...reset, right: '50%', top: '50%', marginRight: gap, transform: 'translateY(-50%)' })
    else if (side === 't') css(lb, { ...reset, left: '50%', bottom: '50%', marginBottom: gap, transform: 'translateX(-50%)' })
    else css(lb, { ...reset, left: '50%', top: '50%', marginTop: gap, transform: 'translateX(-50%)' })
  }
  function machineEl(id) {
    let e = mkEls.get(id)
    if (e) return e
    e = make('button', {
      position: 'absolute', left: '0', top: '0', width: '22px', height: '22px', margin: '-11px 0 0 -11px',
      border: '0', padding: '0', background: 'none', pointerEvents: 'auto', cursor: 'pointer',
    })
    e.type = 'button'
    e.dataset.mid = id
    const pulse = make('span', {
      position: 'absolute', inset: '-7px', borderRadius: '50%', border: '2px solid var(--color-text)',
      display: 'none', pointerEvents: 'none',
      animation: reduced ? 'none' : 'logoRing 1.6s ease-out infinite',
    })
    const ring = make('span', { position: 'absolute', inset: '0', borderRadius: '50%', borderWidth: '1.5px', borderStyle: 'solid', opacity: '0.9', pointerEvents: 'none' })
    const dot = make('span', { position: 'absolute', inset: '5px', borderRadius: '50%', pointerEvents: 'none' })
    const lb = make('span', labelBase)
    lb.hidden = true
    e.append(pulse, ring, dot, lb)
    e._p = { pulse, ring, dot, lb }
    marks.append(e)
    mkEls.set(id, e)
    return e
  }
  function projectEl(p) {
    let e = pkEls.get(p.n)
    if (e) return e
    e = make('button', {
      position: 'absolute', left: '0', top: '0', width: '20px', height: '20px', margin: '-10px 0 0 -10px',
      borderRadius: '5px', borderWidth: '1.5px', borderStyle: 'solid', padding: '0', pointerEvents: 'auto',
      fontFamily: 'inherit', textAlign: 'center', cursor: 'pointer',
    })
    e.type = 'button'
    e.dataset.pid = String(p.n)
    e.setAttribute('aria-label', `Posizione ${p.n} linea lenta: ${p.name}`)
    const num = make('span', { pointerEvents: 'none', font: `600 10px/17px ${monoFont}` }, String(p.n))
    const lb = make('span', labelBase)
    lb.hidden = true
    lb.textContent = p.name
    e.append(num, lb)
    e._p = { lb }
    marks.append(e)
    pkEls.set(p.n, e)
    return e
  }
  function areaChipEl(a) {
    let e = acEls.get(a.key)
    if (e) return e
    e = make('button', {
      position: 'absolute', left: '0', top: '0', zIndex: '3', display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 10px 6px 8px', borderRadius: '10px', border: '1px solid var(--color-border-hover)',
      background: glass, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', color: 'var(--color-text)',
      boxShadow: 'var(--shadow-md)', pointerEvents: 'auto', cursor: 'pointer',
    })
    e.type = 'button'
    e.dataset.area = a.key
    const sw = make('span', { width: '10px', height: '10px', borderRadius: '3px', flex: 'none' })
    const nm = make('span', null, a.name)
    const n = make('span', { font: `500 11px ${monoFont}`, color: 'var(--color-text-muted)' })
    const t = make('span', { font: `500 11px ${monoFont}`, color: 'var(--color-orange)' })
    e.append(sw, nm, n, t)
    e._p = { sw, nm, n, t }
    marks.append(e)
    acEls.set(a.key, e)
    return e
  }

  // Maniglie del contorno in modifica: un quadratino per vertice, un
  // tondino a metà di ogni lato (trascinato o toccato aggiunge un vertice).
  const vhEls = [], mhEls = []
  function handleEl(list, i, vertex) {
    let e = list[i]
    if (e) return e
    e = make('button', {
      position: 'absolute', left: '0', top: '0', padding: '0', pointerEvents: 'auto', zIndex: vertex ? '7' : '6',
      cursor: vertex ? 'move' : 'copy', boxSizing: 'border-box', touchAction: 'none',
    })
    e.type = 'button'
    e.setAttribute('aria-label', vertex ? 'Vertice dell\'area: trascina per spostarlo' : 'Aggiungi un vertice qui')
    marks.append(e)
    list[i] = e
    return e
  }
  function placeHandles() {
    const on = s.mode === 'areas' && s.shape && draft
    let nv = 0, nm = 0
    if (on) {
      const a = allAreas.find(x => x.key === s.shape.key)
      const c = a ? areaColor(a) : 'var(--color-primary)'
      const [sp, sv] = s.shape.selV || [-1, -1]
      draft.forEach((p, pi) => p.forEach((v, vi) => {
        const [sx, sy] = toScreen(v[0], v[1])
        const e = handleEl(vhEls, nv++, true)
        const sel = pi === sp && vi === sv
        const size = sel ? 18 : 14
        e.dataset.vh = pi + ':' + vi
        e.hidden = false
        put(e, 'width', size + 'px'); put(e, 'height', size + 'px')
        put(e, 'margin', `-${size / 2}px 0 0 -${size / 2}px`)
        put(e, 'borderRadius', '4px')
        put(e, 'border', `2px solid ${sel ? 'var(--color-text)' : c}`)
        put(e, 'background', sel ? c : colors.stageBg)
        put(e, 'transform', `translate(${sx}px,${sy}px)`)
        // tondino a metà lato, solo se il lato è abbastanza lungo da toccarlo
        const w = p[(vi + 1) % p.length]
        const [tx, ty] = toScreen(w[0], w[1])
        if (Math.hypot(tx - sx, ty - sy) < 36) return
        const m = handleEl(mhEls, nm++, false)
        m.dataset.mh = pi + ':' + vi
        m.hidden = false
        put(m, 'width', '12px'); put(m, 'height', '12px'); put(m, 'margin', '-6px 0 0 -6px')
        put(m, 'borderRadius', '50%')
        put(m, 'border', `1.5px solid ${c}`)
        put(m, 'background', colors.stageBg)
        put(m, 'opacity', '0.85')
        put(m, 'transform', `translate(${(sx + tx) / 2}px,${(sy + ty) / 2}px)`)
      }))
    }
    for (let i = nv; i < vhEls.length; i++) vhEls[i].hidden = true
    for (let i = nm; i < mhEls.length; i++) mhEls[i].hidden = true
  }

  // Dove finisce un vertice trascinato: su un vertice vicino (anche di
  // un'altra area), altrimenti su un bordo vicino, altrimenti sui 5 cm.
  // Così due aree confinanti restano attaccate senza buchi né sovrapposizioni.
  function snap([wx, wy], pi, vi) {
    const tol = SNAP_PX / view.k
    let best = null, bd = tol
    const n = draft[pi].length
    const isSelf = (a, i, j) => a.key === s.shape.key && i === pi && (j === vi || j === (vi + 1) % n || j === (vi + n - 1) % n)
    for (const a of allAreas) {
      if (a.project) continue
      polysOf(a).forEach((p, i) => p.forEach(([x, y], j) => {
        if (isSelf(a, i, j)) return
        const d = Math.hypot(x - wx, y - wy)
        if (d < bd) { bd = d; best = [x, y] }
      }))
    }
    if (best) return best
    bd = tol * 0.8
    for (const a of allAreas) {
      if (a.project) continue
      polysOf(a).forEach((p, i) => p.forEach((v, j) => {
        const k = (j + 1) % p.length
        if (a.key === s.shape.key && i === pi && (j === vi || k === vi)) return
        const c = closestOnSegment([wx, wy], v, p[k])
        const d = Math.hypot(c[0] - wx, c[1] - wy)
        if (d < bd) { bd = d; best = [Math.round(c[0]), Math.round(c[1])] }
      }))
    }
    return best || [Math.round(wx / SNAP_GRID) * SNAP_GRID, Math.round(wy / SNAP_GRID) * SNAP_GRID]
  }

  let measureCtx = null
  const textW = (t) => {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    measureCtx.font = `500 12px ${getComputedStyle(stage).fontFamily}`
    return measureCtx.measureText(t).width + 16
  }

  function placeMarks() {
    const showLabelsAll = view.k > K_LABELS_ALL
    const occupied = [[W - insets.r - 58, 0, W - insets.r, 176]] // pulsanti di zoom
    const inView = (sx, sy) => sx > -40 && sx < W + 40 && sy > -40 && sy < H + 40
    const selM = s.sel?.kind === 'm' ? s.sel.id : null
    const selP = s.sel?.kind === 'p' ? s.sel.id : null

    // nomi dei locali
    if (!plEls.length) {
      for (const p of plant.places) {
        const e = make('div', {
          position: 'absolute', left: '0', top: '0', font: `500 10px/1 ${monoFont}`, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--color-text-faint)', whiteSpace: 'nowrap', pointerEvents: 'none',
        }, p.name)
        marks.append(e); plEls.push(e)
      }
    }
    plant.places.forEach((p, i) => {
      const [sx, sy] = toScreen(p.x, p.y)
      const v = view.k > K_PLACES[0] && view.k < K_PLACES[1] && inView(sx, sy)
      plEls[i].hidden = !v
      if (v) put(plEls[i], 'transform', `translate(${sx}px,${sy}px) translate(-50%,-50%)`)
    })

    // chip delle aree (vista d'insieme). Prima quelle con più ticket: se due
    // chip si accavallano resta il più utile, l'altra area si tocca sul
    // contorno o dal pannello. Sul telefono il chip dice solo i ticket.
    const chipRects = []
    const ticketsOf = (a) => (a.project ? -1 : (s.areaStats.get(a.key)?.open || 0))
    for (const a of allAreas.slice().sort((x, y) => ticketsOf(y) - ticketsOf(x))) {
      if (!a.label) { const old = acEls.get(a.key); if (old) old.hidden = true; continue }
      const e = areaChipEl(a)
      const [sx, sy] = toScreen(a.label[0], a.label[1])
      const hide = !!s.focus || view.k > K_AREA_CHIPS || (a.project && ((!s.showProject && view.k > 0.02) || s.mode === 'areas')) || !inView(sx, sy)
      e.hidden = hide
      if (hide) continue
      if (e._p.nm.textContent !== a.name) e._p.nm.textContent = a.name
      if (a.project) {
        e._p.n.textContent = s.compact ? '' : a.positions.length + ' pos.'
        e._p.t.textContent = s.compact ? '' : 'progetto'
      } else {
        const st = s.areaStats.get(a.key) || { n: 0, open: 0 }
        e._p.n.textContent = st.n && !s.compact ? st.n + ' macch.' : ''
        e._p.t.textContent = st.open ? (s.compact ? String(st.open) : st.open + ' ticket') : ''
      }
      put(e._p.n, 'display', e._p.n.textContent ? '' : 'none')
      put(e._p.t, 'display', e._p.t.textContent ? '' : 'none')
      put(e, 'padding', s.compact ? '4px 8px 4px 7px' : '6px 10px 6px 8px')
      put(e, 'fontSize', s.compact ? '12px' : '13px')
      put(e._p.sw, 'background', areaColor(a))
      const ew = e.offsetWidth, eh = e.offsetHeight
      const cx = Math.max(ew / 2 + 8, Math.min(W - insets.r - ew / 2 - 56, sx))
      const cy = Math.max(insets.t + eh / 2 + 8, Math.min(H - insets.b - eh / 2 - 8, sy))
      const rect = [cx - ew / 2 - 2, cy - eh / 2 - 2, cx + ew / 2 + 2, cy + eh / 2 + 2]
      if (chipRects.some(o => rect[0] < o[2] && rect[2] > o[0] && rect[1] < o[3] && rect[3] > o[1])) { e.hidden = true; continue }
      chipRects.push(rect)
      put(e, 'transform', `translate(${cx}px,${cy}px) translate(-50%,-50%)`)
      occupied.push(rect)
    }

    // macchine: le selezionate e con ticket gravi per prime, così vincono
    // il posto per l'etichetta
    const pri = (m) => (m.id === selM ? 0 : m.status === 'bad' ? 1 : m.status === 'warn' ? 2 : 3)
    const order = s.items.slice().sort((a, b) => pri(a) - pri(b) || a.name.localeCompare(b.name))
    const seen = new Set()
    const queue = []
    for (const m of order) {
      seen.add(m.id)
      const e = machineEl(m.id)
      const dp = dragPos.get(m.id)
      const [sx, sy] = dp ? toScreen(dp[0], dp[1]) : toScreen(m.x, m.y)
      const v = inView(sx, sy)
      e.hidden = !v
      if (!v) continue
      const isSel = m.id === selM
      const inFocus = !s.focus || m.areaKey === s.focus
      const small = !(s.focus ? inFocus : view.k > K_BIG_MARKERS) && !isSel
      const dim = (s.focus && !inFocus) || (s.onlyOpen && m.status === 'ok' && !isSel)
      const c = STATUS_COLOR[m.status] || STATUS_COLOR.ok
      const size = small ? 12 : 22
      put(e, 'width', size + 'px'); put(e, 'height', size + 'px')
      put(e, 'margin', `-${size / 2}px 0 0 -${size / 2}px`)
      put(e, 'opacity', dim ? '0.38' : '1')
      put(e, 'zIndex', isSel || dragPos.has(m.id) ? '5' : '')
      put(e, 'cursor', s.mode === 'edit' && s.canEdit ? 'move' : 'pointer')
      // In «Aree» i punti si vedono, per allineare i contorni, ma non si toccano.
      put(e, 'pointerEvents', s.mode === 'areas' ? 'none' : 'auto')
      put(e, 'transform', `translate(${sx}px,${sy}px)`)
      const { pulse, ring, dot, lb } = e._p
      put(pulse, 'display', isSel ? 'block' : 'none')
      put(ring, 'display', small ? 'none' : 'block')
      put(ring, 'borderColor', c)
      put(ring, 'borderStyle', m.estimated ? 'dashed' : 'solid')
      put(dot, 'inset', small ? '2px' : '5px')
      put(dot, 'background', c)
      put(dot, 'boxShadow', `0 0 0 ${small ? 1.5 : 2}px ${colors.stageBg}`)
      e.setAttribute('aria-label', m.name + (m.openCount ? `, ${m.openCount} ticket aperti` : ''))
      if (lb.textContent !== m.name) lb.textContent = m.name
      const want = isSel || (!small && !dim && (s.focus ? inFocus : showLabelsAll))
      const r = small ? 6 : 11
      queue.push({ lb, sx, sy, want, force: isSel, text: m.name, r })
      occupied.push([sx - r, sy - r, sx + r, sy + r])
    }
    for (const [id, e] of mkEls) if (!seen.has(id)) { e.remove(); mkEls.delete(id) }

    // posizioni della linea lenta
    if (projectArea) {
      const showP = s.mode !== 'areas' && (s.showProject || s.focus === projectArea.key)
      for (const p of projectArea.positions) {
        const e = projectEl(p)
        const [sx, sy] = toScreen(p.x, p.y)
        const v = showP && inView(sx, sy) && view.k > K_PROJECT
        e.hidden = !v
        if (!v) continue
        const isSel = selP === p.n
        const pc = colors.dark ? projectArea.color.dark : projectArea.color.light
        put(e, 'borderColor', pc)
        put(e, 'background', isSel ? pc : colors.stageBg)
        put(e, 'color', isSel ? colors.stageBg : pc)
        put(e, 'transform', `translate(${sx}px,${sy}px)`)
        queue.push({ lb: e._p.lb, sx, sy, want: isSel || (s.focus === projectArea.key && view.k > 0.06), force: isSel, text: p.name, r: 10 })
        occupied.push([sx - 10, sy - 10, sx + 10, sy + 10])
      }
    }

    // etichette: la prima posizione libera tra destra, sinistra, sopra, sotto
    for (const q of queue) {
      if (!q.want) { q.lb.hidden = true; continue }
      const w = textW(q.text), h = 22, r = q.r + 5
      const cands = [
        ['r', [q.sx + r, q.sy - h / 2, q.sx + r + w, q.sy + h / 2]],
        ['l', [q.sx - r - w, q.sy - h / 2, q.sx - r, q.sy + h / 2]],
        ['t', [q.sx - w / 2, q.sy - r - h, q.sx + w / 2, q.sy - r]],
        ['b', [q.sx - w / 2, q.sy + r, q.sx + w / 2, q.sy + r + h]],
      ]
      const self = [q.sx - q.r, q.sy - q.r, q.sx + q.r, q.sy + q.r]
      let pick = null
      for (const c of cands) {
        const bx = c[1]
        if (bx[0] < 4 || bx[2] > W - insets.r - 4 || bx[1] < insets.t + 4 || bx[3] > H - insets.b - 4) continue
        const hit = occupied.some(o => !(o[0] === self[0] && o[1] === self[1]) && bx[0] < o[2] && bx[2] > o[0] && bx[1] < o[3] && bx[3] > o[1])
        if (!hit) { pick = c; break }
      }
      if (!pick && q.force) pick = cands[0]
      if (!pick) { q.lb.hidden = true; continue }
      q.lb.hidden = false
      if (q.lb._side !== pick[0] || q.lb._r !== q.r) { placeLabel(q.lb, pick[0], q.r); q.lb._side = pick[0]; q.lb._r = q.r }
      occupied.push(pick[1])
    }
  }

  // ── frame ─────────────────────────────────────────────────────────
  function schedule() { if (!raf && !destroyed) raf = requestAnimationFrame(() => { raf = 0; frame() }) }
  function frame() {
    if (destroyed) return
    drawLayer(cad, plant.base, colors.line)
    const showProj = (s.showProject || s.focus === projectArea?.key) && plant.project
    proj.hidden = !showProj
    if (showProj) drawLayer(proj, plant.project, colors.proj)
    areasG.setAttribute('transform', `matrix(${view.k} 0 0 ${view.k} ${W / 2 - view.vx * view.k} ${H / 2 + view.vy * view.k})`)
    syncDraft()
    styleAreas()
    placeMarks()
    placeHandles()
    updateScale()
    prune()
  }

  // Barra di scala: la lunghezza tonda più vicina a ~110 px.
  function updateScale() {
    if (!hud?.scale) return
    const want = 110 / view.k / 1000
    let L = 1
    for (const step of [1, 2, 5, 10, 20, 50, 100, 200]) if (step <= want) L = step
    const px = Math.round(L * 1000 * view.k)
    const key = L + ':' + px
    if (hud.scale._k === key) return
    hud.scale._k = key
    hud.scale.firstChild.textContent = L + ' m'
    hud.scale.lastChild.style.width = px + 'px'
  }
  const fmtM = (mm) => (mm / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  // ── puntatore: pan, pinch, trascinamento dei punti ────────────────
  const ptrs = new Map()
  let gesture = null
  const localXY = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const isUi = (t) => t.closest?.('[data-map-ui]')
  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (isUi(e.target)) return
    const [x, y] = localXY(e)
    ptrs.set(e.pointerId, [x, y])
    try { stage.setPointerCapture(e.pointerId) } catch { /* puntatore già perso */ }
    if (ptrs.size === 2) {
      // Un vertice a metà trascinamento torna dov'era: il secondo dito è uno zoom.
      if (gesture?.type === 'vdrag' && s.shape) { draft = clonePolys(s.shape.polys); schedule() }
      const [a, b] = [...ptrs.values()]
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      gesture = { type: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: view.k, w: toWorld(mid[0], mid[1]) }
      return
    }
    if (s.mode === 'areas' && s.shape && draft) {
      const h = e.target.closest?.('[data-vh],[data-mh]')
      if (h) {
        const [pi, vi] = (h.dataset.vh || h.dataset.mh).split(':').map(Number)
        gesture = { type: h.dataset.vh ? 'vdrag' : 'vins', pi, vi, x0: x, y0: y, moved: false }
        return
      }
    }
    const mk = e.target.closest?.('[data-mid]')
    if (s.mode === 'edit' && s.canEdit && mk && !s.placing) {
      gesture = { type: 'drag', id: mk.dataset.mid, x0: x, y0: y, moved: false }
      return
    }
    gesture = { type: 'pan', x0: x, y0: y, vx: view.vx, vy: view.vy, moved: false, target: e.target }
  }
  function onMove(e) {
    const [x, y] = localXY(e)
    if (e.pointerType === 'mouse' && hud?.coord) { const [wx, wy] = toWorld(x, y); hud.coord.textContent = `X ${fmtM(wx)} · Y ${fmtM(wy)} m` }
    if (!ptrs.has(e.pointerId)) return
    ptrs.set(e.pointerId, [x, y])
    if (!gesture) return
    if (gesture.type === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]
      const d = Math.hypot(a[0] - b[0], a[1] - b[1])
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      view.k = gesture.k0 * d / Math.max(1, gesture.d0); clampView()
      view.vx = gesture.w[0] - (mid[0] - W / 2) / view.k
      view.vy = gesture.w[1] + (mid[1] - H / 2) / view.k
      clampView(); schedule()
      return
    }
    if (gesture.type === 'pan') {
      const dx = x - gesture.x0, dy = y - gesture.y0
      if (!gesture.moved && Math.hypot(dx, dy) > 5) { gesture.moved = true; stage.style.cursor = 'grabbing' }
      if (gesture.moved) { view.vx = gesture.vx - dx / view.k; view.vy = gesture.vy + dy / view.k; clampView(); schedule() }
    }
    if (gesture.type === 'drag') {
      if (!gesture.moved && Math.hypot(x - gesture.x0, y - gesture.y0) > 4) gesture.moved = true
      if (gesture.moved) { dragPos.set(gesture.id, toWorld(x, y)); schedule() }
    }
    if ((gesture.type === 'vdrag' || gesture.type === 'vins') && draft) {
      if (!gesture.moved && Math.hypot(x - gesture.x0, y - gesture.y0) > 4) {
        gesture.moved = true
        // dal tondino a metà lato nasce un vertice nuovo, che si trascina
        if (gesture.type === 'vins') { insertMid(gesture.pi, gesture.vi); gesture.type = 'vdrag'; gesture.vi += 1 }
      }
      if (gesture.moved) { draft[gesture.pi][gesture.vi] = snap(toWorld(x, y), gesture.pi, gesture.vi); schedule() }
    }
  }
  function insertMid(pi, vi) {
    const p = draft[pi], a = p[vi], b = p[(vi + 1) % p.length]
    p.splice(vi + 1, 0, [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)])
  }
  function onUp(e) {
    if (!ptrs.has(e.pointerId)) return
    ptrs.delete(e.pointerId)
    stage.style.cursor = s.placing ? 'crosshair' : 'grab'
    const g = gesture
    if (g && g.type === 'pinch') { if (ptrs.size < 2) gesture = null; return }
    gesture = null
    if (!g) return
    if (e.type === 'pointercancel') {
      if (g.type === 'drag') { dragPos.delete(g.id); schedule() }
      if ((g.type === 'vdrag' || g.type === 'vins') && s.shape) { draft = clonePolys(s.shape.polys); schedule() }
      return
    }
    if (g.type === 'drag') {
      if (g.moved) on.dragEnd?.(g.id, dragPos.get(g.id))
      else on.selectMachine?.(g.id)
      return
    }
    if (g.type === 'vdrag') {
      if (g.moved) on.shapeChange?.(clonePolys(draft), [g.pi, g.vi])
      else on.selectVertex?.([g.pi, g.vi])
      return
    }
    if (g.type === 'vins') {
      insertMid(g.pi, g.vi); schedule()
      on.shapeChange?.(clonePolys(draft), [g.pi, g.vi + 1])
      return
    }
    if (g.type === 'pan' && !g.moved) click(g.target, localXY(e))
  }
  function click(t, [x, y]) {
    if (s.placing) { const p = toWorld(x, y); dragPos.set(s.placing, p); schedule(); on.place?.(s.placing, p); return }
    const mk = t.closest?.('[data-mid]')
    if (mk) { on.selectMachine?.(mk.dataset.mid); return }
    const pk = t.closest?.('[data-pid]')
    if (pk) { on.selectProject?.(Number(pk.dataset.pid)); return }
    const ac = t.closest?.('[data-area]')
    if (ac) { on.focusArea?.(ac.dataset.area); return }
    if (s.mode === 'areas' && s.shape) on.selectVertex?.(null)
  }
  // Tastiera: Invio/spazio su un punto arriva come click con detail 0.
  function onKeyClick(e) {
    if (e.detail !== 0) return
    const mk = e.target.closest('[data-mid]'); if (mk) { on.selectMachine?.(mk.dataset.mid); return }
    const pk = e.target.closest('[data-pid]'); if (pk) { on.selectProject?.(Number(pk.dataset.pid)); return }
    const ac = e.target.closest('[data-area]'); if (ac) on.focusArea?.(ac.dataset.area)
  }
  function onWheel(e) {
    if (isUi(e.target)) return
    e.preventDefault()
    const [x, y] = localXY(e)
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)), x, y)
  }
  function onDbl(e) {
    if (isUi(e.target) || e.target.closest?.('[data-mid],[data-pid],[data-area],[data-vh],[data-mh]')) return
    const [x, y] = localXY(e)
    zoomAt(2, x, y)
  }
  const onLeave = () => { if (hud?.coord) hud.coord.textContent = '' }

  stage.addEventListener('pointerdown', onDown)
  stage.addEventListener('pointermove', onMove)
  stage.addEventListener('pointerup', onUp)
  stage.addEventListener('pointercancel', onUp)
  stage.addEventListener('pointerleave', onLeave)
  stage.addEventListener('wheel', onWheel, { passive: false })
  stage.addEventListener('dblclick', onDbl)
  marks.addEventListener('click', onKeyClick)

  // ── dimensioni e tema ─────────────────────────────────────────────
  function resize() {
    const r = stage.getBoundingClientRect()
    W = Math.max(1, r.width); H = Math.max(1, r.height)
    dpr = Math.min(2.5, window.devicePixelRatio || 1)
    for (const c of [cad, proj]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
    kMin = fitK(plant.fit, 0.98) * 0.6
    kMax = 0.32
  }
  const ro = new ResizeObserver(() => {
    resize()
    if (!sized && W > 1 && H > 1) { sized = true; if (!restored) setView(plant.fit, 0.98) }
    clampView(); schedule()
  })
  ro.observe(stage)
  const onTheme = () => { readColors(); schedule() }
  const mo = new MutationObserver(onTheme)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  mq?.addEventListener?.('change', onTheme)
  document.fonts?.ready?.then(() => { measureCtx = null; schedule() })

  readColors()
  resize()
  if (W > 1 && H > 1) { sized = true; setView(plant.fit, 0.98) }

  return {
    update(next) {
      // Un punto trascinato resta dove l'hai lasciato finché il salvataggio
      // non porta le coordinate nuove: così non torna indietro per un frame.
      if (next.items && dragPos.size) {
        const prev = new Map(s.items.map(m => [m.id, m]))
        for (const m of next.items) {
          const o = prev.get(m.id)
          if (dragPos.has(m.id) && (!o || o.x !== m.x || o.y !== m.y)) dragPos.delete(m.id)
        }
      }
      const areasChanged = next.areas && next.areas !== s.areas
      const shapeChanged = 'shape' in next && next.shape !== s.shape
      // Un gesto sul contorno in corso non si interrompe per un render di React.
      const shapeGesture = gesture && (gesture.type === 'vdrag' || gesture.type === 'vins')
      s = { ...s, ...next }
      if (shapeChanged && !shapeGesture) draft = s.shape ? clonePolys(s.shape.polys) : null
      if (areasChanged) setAreaList(s.areas)
      else if (shapeChanged) buildAreas()
      stage.style.cursor = s.placing ? 'crosshair' : 'grab'
      schedule()
    },
    // Il riquadro di disegno visibile, al netto di pannello e barre.
    viewBox() {
      const a = toWorld(0, H - insets.b), b = toWorld(W - insets.r, insets.t)
      return [a[0], a[1], b[0], b[1]]
    },
    clearDrag(id) { dragPos.delete(id); schedule() },
    setInsets(next) { insets = { ...insets, ...next }; schedule() },
    fit() { flyTo(plant.fit, 0.98) },
    focusArea(key) { flyTo(areaBox(key)) },
    // Inquadra un contorno nuovo, che il motore ancora non conosce.
    showPolys(polys) {
      const xs = polys.flat().map(v => v[0]), ys = polys.flat().map(v => v[1])
      if (!xs.length) return
      const p = 6000
      flyTo([Math.min(...xs) - p, Math.min(...ys) - p, Math.max(...xs) + p, Math.max(...ys) + p])
    },
    showPoint(x, y, r) { if (offView(x, y) || view.k < 0.03) flyTo(pointBox(x, y, r), 0.9) },
    zoom(f) { zoomAt(f, (W - insets.r) / 2, insets.t + (H - insets.t - insets.b) / 2) },
    getView() { return { ...view } },
    setView(v) { if (!v) return; view.k = v.k; view.vx = v.vx; view.vy = v.vy; restored = true; clampView(); schedule() },
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf); cancelAnimationFrame(anim)
      ro.disconnect(); mo.disconnect(); mq?.removeEventListener?.('change', onTheme)
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      stage.removeEventListener('pointerleave', onLeave)
      stage.removeEventListener('wheel', onWheel)
      stage.removeEventListener('dblclick', onDbl)
      marks.removeEventListener('click', onKeyClick)
      for (const o of imgs.values()) o.img.src = ''
      imgs.clear()
      vhEls.length = 0; mhEls.length = 0
      marks.replaceChildren()
      areasG.replaceChildren()
    },
  }
}

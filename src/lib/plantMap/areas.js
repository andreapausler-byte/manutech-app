// Aree sulla mappa impianto. Il contorno è un dato dell'area
// (`areas.map_shape`, migration 070), come il punto lo è della macchina:
// gli admin lo correggono sulla mappa e da lì vale anche per Macchinari.
// Qui: leggerlo, i colori per la planimetria, la geometria dell'editor.
//
// map_shape = { polys: [[[x, y], ...], ...], label: [x, y],
//               basis, updated_at, updated_by, updated_by_name }
// Coordinate in mm nel sistema del disegno DWG, come `map_position`.

// Colori pensati per staccare sul disegno, chiaro e scuro. `dark` è anche
// quello che finisce in `areas.color`: Macchinari e mappa usano lo stesso.
export const AREA_MAP_COLORS = [
  { dark: '#e0904a', light: '#c46b1f', label: 'Arancio' },
  { dark: '#9a8cff', light: '#6c5ce0', label: 'Viola' },
  { dark: '#ef6a62', light: '#d0413a', label: 'Rosso' },
  { dark: '#d9be4a', light: '#a98a12', label: 'Ocra' },
  { dark: '#33c1d6', light: '#0d93a8', label: 'Ciano' },
  { dark: '#e57bd0', light: '#b13f9b', label: 'Rosa' },
  { dark: '#6aa8ff', light: '#2f6fd1', label: 'Blu' },
  { dark: '#a3d65c', light: '#5b8f1c', label: 'Verde' },
]

// Un colore di `areas.color` nelle due varianti della mappa. Quelli della
// tavolozza hanno la loro; gli altri (scelti in Macchinari) si scuriscono
// per il tema chiaro.
export function areaMapColor(hex) {
  const h = (hex || '').trim().toLowerCase()
  const known = AREA_MAP_COLORS.find(c => c.dark === h)
  if (known) return { dark: known.dark, light: known.light }
  const m = /^#?([0-9a-f]{6})$/.exec(h)
  if (!m) return { dark: '#9aa5a0', light: '#5d6b65' }
  const n = parseInt(m[1], 16)
  const dim = (v) => Math.round(v * 0.72).toString(16).padStart(2, '0')
  return { dark: '#' + m[1], light: '#' + dim((n >> 16) & 255) + dim((n >> 8) & 255) + dim(n & 255) }
}

const num = (v) => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}

// areas.map_shape letto in un posto solo. `null` = l'area non ha un
// contorno suo; `polys: []` = ce l'aveva ed è stato tolto.
export function readAreaShape(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.polys)) return null
  const polys = raw.polys
    .map(p => (Array.isArray(p) ? p.map(v => [num(v?.[0]), num(v?.[1])]).filter(([x, y]) => x != null && y != null) : []))
    .filter(p => p.length >= 3)
  const l = Array.isArray(raw.label) ? [num(raw.label[0]), num(raw.label[1])] : null
  return {
    polys,
    label: l && l[0] != null && l[1] != null ? l : labelPoint(polys),
    basis: typeof raw.basis === 'string' ? raw.basis : '',
    updatedAt: raw.updated_at || null,
    updatedByName: raw.updated_by_name || null,
  }
}

// Le aree di ManuTech, nell'ordine di Macchinari, pronte per la mappa.
// Il contorno è quello salvato sull'area; se non c'è (070 non eseguita,
// demo) quello del disegno con lo stesso nome; altrimenti l'area c'è lo
// stesso, "da disegnare". Un'org senza nessuna area vede quelle del
// disegno: si creano in ManuTech al primo salvataggio.
export function buildMapAreas(plant, rows) {
  const drawn = plant?.areas || []
  if (!rows?.length) {
    return drawn.map(a => ({
      key: 'plant:' + a.name, id: null, name: a.name, color: a.color, colorHex: a.color.dark,
      polys: a.polys, label: a.label, stored: false,
    }))
  }
  const byName = new Map(drawn.map(a => [a.name.toLowerCase(), a]))
  return rows.map(r => {
    const saved = r.map_shape != null ? readAreaShape(r.map_shape) : null
    const fallback = saved ? null : byName.get((r.name || '').trim().toLowerCase())
    const color = fallback ? fallback.color : areaMapColor(r.color)
    return {
      key: r.id, id: r.id, name: r.name || 'Senza nome', color,
      colorHex: fallback ? fallback.color.dark : (r.color || color.dark),
      polys: saved ? saved.polys : fallback ? fallback.polys : [],
      label: saved ? saved.label : fallback ? fallback.label : null,
      stored: !!saved,
      basis: saved?.basis || '',
      updatedAt: saved?.updatedAt || null,
      updatedByName: saved?.updatedByName || null,
    }
  })
}

// ── geometria ────────────────────────────────────────────────────────

export function pointInPoly(x, y, p) {
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export const pointInShape = (x, y, polys) => (polys || []).some(p => pointInPoly(x, y, p))

function polyArea(p) {
  let s = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1])
  return Math.abs(s / 2)
}

// Il punto di `ab` più vicino a `pt`.
export function closestOnSegment(pt, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

// Dove mettere il chip dell'area: dentro il pezzo più grande, il più
// lontano possibile dai bordi. Su una griglia: per forme da planimetria
// (rettangoli, L) basta e avanza.
export function labelPoint(polys) {
  const big = (polys || []).reduce((best, p) => (!best || polyArea(p) > polyArea(best) ? p : best), null)
  if (!big) return null
  const xs = big.map(v => v[0]), ys = big.map(v => v[1])
  const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  let best = null, bestD = -1
  const N = 18
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const x = b[0] + (b[2] - b[0]) * i / N, y = b[1] + (b[3] - b[1]) * j / N
      if (!pointInPoly(x, y, big)) continue
      let d = Infinity
      for (let k = 0, h = big.length - 1; k < big.length; h = k++) {
        const c = closestOnSegment([x, y], big[h], big[k])
        d = Math.min(d, Math.hypot(c[0] - x, c[1] - y))
      }
      if (d > bestD) { bestD = d; best = [x, y] }
    }
  }
  const [x, y] = best || [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
  return [Math.round(x), Math.round(y)]
}

// Il chip resta dov'era se è ancora dentro o vicino all'area (alcuni stanno
// apposta appena fuori, come una didascalia); altrimenti si ricalcola.
export function keepOrPlaceLabel(prev, polys) {
  if (!polys?.length) return null
  if (prev && (pointInShape(prev[0], prev[1], polys) || polys.some(p => p.some((v, i) => {
    const c = closestOnSegment(prev, v, p[(i + 1) % p.length])
    return Math.hypot(c[0] - prev[0], c[1] - prev[1]) < 6000
  })))) return prev
  return labelPoint(polys)
}

// Un rettangolo nel mezzo della vista: il pezzo nuovo da cui si parte.
export function rectInView(box) {
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2
  // almeno 8 m: un locale, non un tombino, anche se la vista è molto stretta
  const h = Math.max(4000, Math.min(12000, Math.min(box[2] - box[0], box[3] - box[1]) * 0.15))
  const r = (v) => Math.round(v / 50) * 50
  return [[r(cx - h), r(cy - h * 0.7)], [r(cx + h), r(cy - h * 0.7)], [r(cx + h), r(cy + h * 0.7)], [r(cx - h), r(cy + h * 0.7)]]
}

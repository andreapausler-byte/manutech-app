/**
 * supplierInference — inferenza della specialità di un fornitore dallo
 * storico ordini ricambi. Pura utility: nessun side-effect, nessuna query.
 *
 * Logica: per ogni ordine in cui il fornitore appare (come destinatario
 * dell'ordine o come quote accettata), classifichiamo `spare_part_name`
 * confrontandolo con il vocabolario per specialità. Aggreghiamo i hit
 * per supplier e ritorniamo le top specialità.
 *
 * Non scrive sulla colonna manuale `supplier_profiles.specialties`. Serve
 * solo a far vedere all'admin "questo è quello che lo storico dice", e
 * in caso di divergenza con la specialità manuale lo segnala.
 */

// Vocabolario keyword → specialità. Le keyword sono lowercase, match
// per substring sul nome ricambio (anch'esso lowercased). Multi-parola
// è preferibile (riduce ambiguità tipo "compressore" pneumatico vs frigo).
//
// Quando aggiungi keyword: stai stretto. Falso positivo > falso negativo.
const SPECIALTY_KEYWORDS = {
  meccanico: [
    'cuscinetto', 'pistoncino', 'guarnizione', 'oring', 'o-ring',
    'vite', 'bullone', 'dado', 'rondella', 'molla', 'pulegga',
    'catena', 'rasamento', 'ingranaggio', 'albero', 'supporto',
    'paraolio', 'rondelle', 'kit guarnizioni',
  ],
  elettrico: [
    'cavo', 'fusibile', 'contattore', 'relè', 'rele', 'magnete',
    'morsetto', 'interruttore', 'salvavita', 'differenziale',
    'magnetotermico', 'connettore elettrico',
  ],
  pneumatico: [
    'valvola pneumatica', 'attuatore pneumatico', 'cilindro pneumatico',
    'raccordo aria', 'silenziatore', 'regolatore aria', 'fru',
    'tubo aria', 'compressore aria',
  ],
  idraulico: [
    'pompa idraulica', 'cilindro idraulico', 'valvola idraulica',
    'flessibile idraulico', 'accumulatore', 'olio idraulico',
    'centralina idraulica', 'tubo idraulico',
  ],
  refrigerazione: [
    'compressore frigo', 'compressore frigorifero', 'evaporatore',
    'condensatore frigo', 'gas refrigerante', 'r134', 'r404',
    'capillare', 'pressostato frigo',
  ],
  elettronico: [
    'encoder', 'sonda', 'sensore', 'pcb', 'scheda elettronica',
    'modulo', 'plc', 'hmi', 'display', 'inverter', 'driver',
    'pt100', 'termocoppia', 'fotocellula',
  ],
  antincendio: [
    'estintore', 'sprinkler', 'manichetta antincendio', 'rilevatore fumo',
    'detector antincendio',
  ],
  saldatura: [
    'filo saldatura', 'elettrodi saldatura', 'gas argon', 'tig',
    'mig', 'disco abrasivo', 'torcia saldatura',
  ],
  automazione: [
    'robot', 'servomotore', 'servo motor', 'asse lineare',
    'drive servo', 'inverter', 'driver motore',
  ],
}

const HITS_THRESHOLD = 1 // basta un hit per mostrare la specialità (filtro top_n riduce il rumore)
const TOP_N = 3          // mostra al massimo le 3 specialità più ricorrenti

/**
 * Verifica se un ordine "appartiene" al fornitore.
 * Match: supplier_id diretto, OR supplier (free text) case-insensitive,
 * OR una qualsiasi quote (anche solo richiesta, non accepted) con questo
 * supplier. Anche una quote pendente è segnale: "abbiamo chiesto a questo
 * fornitore questo tipo di ricambio".
 */
function orderBelongsToSupplier(order, supplierId, supplierName) {
  if (supplierId && order.supplier_id === supplierId) return true
  if (supplierName && order.supplier
    && order.supplier.trim().toLowerCase() === supplierName.trim().toLowerCase()) {
    return true
  }
  if (Array.isArray(order.quotes)) {
    return order.quotes.some(q =>
      (supplierId && q.supplier_id === supplierId)
      || (supplierName && q.supplier_name
        && q.supplier_name.trim().toLowerCase() === supplierName.trim().toLowerCase())
    )
  }
  return false
}

/**
 * Classifica un nome ricambio: ritorna l'array di specialità che hittano.
 * Una stringa può contare per più specialità (es. "valvola pneumatica con
 * sensore" → pneumatico + elettronico).
 */
function classifyPartName(name) {
  if (!name || typeof name !== 'string') return []
  const lower = name.toLowerCase()
  const hits = []
  for (const [specialty, keywords] of Object.entries(SPECIALTY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      hits.push(specialty)
    }
  }
  return hits
}

/**
 * Inferisce le specialità per un fornitore.
 *
 * @param {Object} args
 * @param {string|null} args.supplierId  user_id del fornitore (può essere null se solo nome)
 * @param {string|null} args.supplierName company_name (per match su free-text supplier)
 * @param {Array} args.orders            tutti gli spare_part_orders dell'org
 * @returns {{
 *   inferred: Array<{ specialty: string, count: number }>,
 *   matchedOrdersCount: number,
 *   classifiedCount: number,
 * }}
 */
export function inferSupplierSpecialties({ supplierId, supplierName, orders }) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return { inferred: [], matchedOrdersCount: 0, classifiedCount: 0 }
  }
  const matched = orders.filter(o => orderBelongsToSupplier(o, supplierId, supplierName))
  const counts = {}
  let classifiedCount = 0
  for (const order of matched) {
    const hits = classifyPartName(order.spare_part_name)
    if (hits.length > 0) classifiedCount++
    for (const sp of hits) {
      counts[sp] = (counts[sp] || 0) + 1
    }
  }
  const inferred = Object.entries(counts)
    .filter(([, count]) => count >= HITS_THRESHOLD)
    .sort(([, a], [, b]) => b - a)
    .slice(0, TOP_N)
    .map(([specialty, count]) => ({ specialty, count }))
  return { inferred, matchedOrdersCount: matched.length, classifiedCount }
}

/**
 * Confronta inferred con manual: ritorna { onlyInferred, onlyManual, common }.
 * onlyInferred = specialità dello storico non presenti nella checkbox manuale
 * (segnalano possibile drift della specialità del fornitore).
 */
export function compareSpecialties(manualKeys, inferred) {
  const manualSet = new Set(manualKeys || [])
  const inferredSet = new Set(inferred.map(i => i.specialty))
  return {
    onlyInferred: inferred.filter(i => !manualSet.has(i.specialty)).map(i => i.specialty),
    onlyManual: [...manualSet].filter(k => !inferredSet.has(k)),
    common: [...manualSet].filter(k => inferredSet.has(k)),
  }
}

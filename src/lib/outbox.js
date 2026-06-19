/**
 * outbox.js — Coda persistente di operazioni rinviate (IndexedDB).
 *
 * Primo mattone della modalità offline: una coda generica e durevole che
 * sopravvive a refresh, chiusura e riavvio dell'app. Nasce per mettere al
 * sicuro l'audio vocale (vedi `voiceOutbox.js`), ma è agnostica rispetto al
 * dominio: ogni record ha un `type` e un payload arbitrario.
 *
 * IndexedDB (non localStorage) perché:
 *  - tiene Blob binari nativi (l'audio NON va mai serializzato in base64);
 *  - non ha il limite ~5MB di localStorage;
 *  - è asincrono e non blocca il main thread.
 *
 * Record minimo: { id, type, status, createdAt, updatedAt, ...campi liberi }.
 * Notifica i cambiamenti via subscriber in-memory + BroadcastChannel
 * (aggiorna anche altre tab aperte).
 */

const DB_NAME = 'manutech-outbox'
const DB_VERSION = 1
const STORE = 'items'

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponibile'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('by_createdAt', 'createdAt')
        store.createIndex('by_type', 'type')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

function promisifyReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    let result
    Promise.resolve(fn(store)).then(
      (r) => { result = r },
      (err) => { try { t.abort() } catch { /* noop */ } reject(err) },
    )
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error('Transazione annullata'))
  })
}

// ─── Change notification (in-tab + cross-tab) ───
const subscribers = new Set()
let bc = null
try {
  bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('manutech-outbox') : null
  if (bc) bc.onmessage = () => subscribers.forEach((cb) => { try { cb() } catch { /* noop */ } })
} catch {
  bc = null
}

export function onOutboxChange(cb) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

function emitChange() {
  subscribers.forEach((cb) => { try { cb() } catch { /* noop */ } })
  if (bc) { try { bc.postMessage('change') } catch { /* noop */ } }
}

// ─── CRUD ───
export async function outboxPut(record) {
  await withStore('readwrite', (s) => promisifyReq(s.put(record)))
  emitChange()
  return record
}

export async function outboxGet(id) {
  return withStore('readonly', (s) => promisifyReq(s.get(id)))
}

export async function outboxAll() {
  const rows = await withStore('readonly', (s) => promisifyReq(s.getAll()))
  return (rows || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

export async function outboxDelete(id) {
  await withStore('readwrite', (s) => promisifyReq(s.delete(id)))
  emitChange()
}

export async function outboxCount() {
  return withStore('readonly', (s) => promisifyReq(s.count()))
}

export function isOutboxAvailable() {
  return typeof indexedDB !== 'undefined'
}

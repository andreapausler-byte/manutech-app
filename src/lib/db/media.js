// Galleria media per macchinario.
//
// Le foto e i video di una macchina nascono sparsi: allegati alla
// segnalazione, mandati in chat, agganciati a un log di manutenzione o a
// un intervento. Il collegamento alla macchina c'è già in tutte e quattro
// le sorgenti — qui le uniamo in un unico feed cronologico.
//
// In supabase mode il lavoro lo fa la RPC `get_machine_media` (migration
// 060): quattro tabelle in una query sola, per non ricadere nel pattern
// N+1. In demo mode replichiamo la stessa logica su localStorage, dove
// però i log di manutenzione non esistono (nessuno store).

import { supabase } from './_client'
import { KEYS, getStore, setStore } from './_demoStore'

// Solo foto e video: la galleria è visiva, i vocali restano in chat.
const VISUAL_TYPES = ['photo', 'image', 'video']

function normalizeType(type) {
  return String(type || 'photo').toLowerCase() === 'video' ? 'video' : 'photo'
}

// Un media grezzo (dalla colonna jsonb) + il contesto della sua sorgente
// → riga normalizzata di galleria.
function toGalleryItem(raw, context) {
  return {
    url: raw.url,
    thumb_url: raw.thumb_url || null,
    type: normalizeType(raw.type),
    name: raw.name || null,
    ...context,
  }
}

// Stessa foto rilanciata in più punti: teniamo l'occorrenza più vecchia,
// che è quella originale. Ordina per data decrescente.
function dedupeAndSort(items) {
  const byUrl = new Map()
  for (const item of items) {
    if (!item.url) continue
    const seen = byUrl.get(item.url)
    if (!seen || new Date(item.taken_at) < new Date(seen.taken_at)) byUrl.set(item.url, item)
  }
  return [...byUrl.values()].sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at))
}

export const media = {
  // machineName serve solo in fallback: le segnalazioni vecchie hanno lo
  // snapshot testuale `machine` ma non la FK machine_id.
  async getMachineMedia(machineId, { limit = 60, offset = 0, machineName = null } = {}) {
    if (!machineId) return []

    if (supabase) {
      const { data, error } = await supabase.rpc('get_machine_media', {
        _machine_id: machineId,
        _limit: limit,
        _offset: offset,
      })
      if (error) {
        // Migration 060 non ancora applicata: la galleria resta vuota
        // invece di rompere la scheda macchina.
        console.warn('[ManuTech] get_machine_media non disponibile:', error.message)
        return []
      }
      return (data || []).map(row => ({
        url: row.url,
        thumb_url: row.thumb_url || null,
        type: normalizeType(row.media_type),
        name: row.name || null,
        taken_at: row.taken_at,
        source: row.source,
        source_id: row.source_id,
        source_label: row.source_label,
        author_name: row.author_name,
      }))
    }

    // ── Demo mode ──
    const reports = getStore(KEYS.reports)
    const interventions = getStore(KEYS.interventions)
    const items = []

    const belongsToMachine = (r) =>
      r.machine_id === machineId || (!r.machine_id && machineName && r.machine === machineName)

    for (const r of reports) {
      if (!belongsToMachine(r)) continue
      const label = r.display_id || r.title
      for (const m of (r.media || [])) {
        if (!VISUAL_TYPES.includes(String(m.type).toLowerCase())) continue
        items.push(toGalleryItem(m, {
          taken_at: r.created_at,
          source: 'segnalazione',
          source_id: r.id,
          source_label: label,
          author_name: r.created_by_name,
        }))
      }
      for (const c of (r.comments || [])) {
        if (c.deleted_at) continue
        for (const m of (c.media || [])) {
          if (!VISUAL_TYPES.includes(String(m.type).toLowerCase())) continue
          items.push(toGalleryItem(m, {
            taken_at: c.created_at,
            source: 'chat',
            source_id: r.id,
            source_label: label,
            author_name: c.user_name,
          }))
        }
      }
    }

    for (const i of interventions) {
      if (i.machine_id !== machineId) continue
      for (const m of (i.media || [])) {
        if (!VISUAL_TYPES.includes(String(m.type).toLowerCase())) continue
        items.push(toGalleryItem(m, {
          taken_at: i.actual_end_at || i.scheduled_start_at || i.created_at,
          source: 'intervento',
          source_id: i.id,
          source_label: i.title,
          author_name: i.assigned_to_name || i.created_by_name,
        }))
      }
    }

    return dedupeAndSort(items).slice(offset, offset + limit)
  },

  // Aggiunge un allegato alla macchina: la foto appena scattata davanti
  // all'impianto, o il PDF che il fornitore ha appena lasciato.
  //
  // Via RPC (migration 061) per lo stesso motivo del toggle qui sotto:
  // `machines_update` è admin-only, ma chi ha in mano la macchina è
  // l'operatore. Autore e data li mette il server.
  // Ritorna la lista attachments aggiornata.
  async addMachineAttachment(machineId, attachment) {
    if (supabase) {
      const { data, error } = await supabase.rpc('add_machine_attachment', {
        _machine_id: machineId,
        _attachment: {
          url: attachment.url,
          thumb_url: attachment.thumb_url || null,
          type: attachment.type,
          category: attachment.category,
          name: attachment.name,
        },
      })
      if (error) throw error
      return data || []
    }

    const list = getStore(KEYS.machines)
    const idx = list.findIndex(m => m.id === machineId)
    if (idx === -1) throw new Error('Macchinario non trovato')
    const attachments = list[idx].attachments || []
    if (attachments.some(a => a.url === attachment.url)) return attachments

    const next = [...attachments, {
      type: attachment.type,
      category: attachment.category,
      name: attachment.name,
      url: attachment.url,
      thumb_url: attachment.thumb_url || null,
      uploaded_at: new Date().toISOString(),
      uploaded_by_name: attachment.uploaded_by_name || null,
      uploaded_from: 'campo',
    }]
    list[idx] = { ...list[idx], attachments: next }
    setStore(KEYS.machines, list)
    return next
  },

  // Promuove (o rimuove) una foto nella galleria curata della macchina,
  // cioè in machines.attachments categoria 'foto' — la stessa cartella
  // che il tab Documentazione mostra già.
  //
  // Via RPC perché machines_update è admin-only, ma chi riconosce la foto
  // che vale è il tecnico davanti alla macchina.
  // Ritorna la lista attachments aggiornata.
  async toggleMachineMediaFeature(machineId, item) {
    if (supabase) {
      const { data, error } = await supabase.rpc('toggle_machine_media_feature', {
        _machine_id: machineId,
        _media: {
          url: item.url,
          thumb_url: item.thumb_url || null,
          type: item.type,
          name: item.name,
          taken_at: item.taken_at,
          source: item.source,
          source_id: item.source_id,
          source_label: item.source_label,
          author_name: item.author_name,
        },
      })
      if (error) throw error
      return data || []
    }

    const list = getStore(KEYS.machines)
    const idx = list.findIndex(m => m.id === machineId)
    if (idx === -1) throw new Error('Macchinario non trovato')
    const attachments = list[idx].attachments || []
    const existing = attachments.find(a => a.url === item.url)

    let next
    if (existing) {
      // I documenti caricati a mano non si rimuovono da qui.
      if (!existing.promoted_from) return attachments
      next = attachments.filter(a => a.url !== item.url)
    } else {
      next = [...attachments, {
        type: item.type === 'video' ? 'video' : 'image',
        category: 'foto',
        name: item.name || 'Foto dalla galleria',
        url: item.url,
        thumb_url: item.thumb_url || null,
        uploaded_at: item.taken_at || new Date().toISOString(),
        uploaded_by_name: item.author_name || null,
        promoted_from: { source: item.source, id: item.source_id, label: item.source_label },
        promoted_at: new Date().toISOString(),
      }]
    }

    list[idx] = { ...list[idx], attachments: next }
    setStore(KEYS.machines, list)
    return next
  },
}

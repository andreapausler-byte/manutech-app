/**
 * useMachineUpload — Portare un file nella scheda macchina, dal campo
 *
 * Due gesti, uno solo dietro: scattare una foto e caricare un documento
 * finiscono entrambi in `machines.attachments` via la RPC
 * `add_machine_attachment` (migration 061), perché `machines_update` è
 * admin-only ma chi ha in mano la macchina è l'operatore.
 *
 * Le foto passano dal compressore prima di partire: sulla rete di
 * stabilimento una foto da 4 MB non arriva, e nessuno riprova.
 *
 * Uso:
 *   const { capturePhoto, uploadDocument, busy } =
 *     useMachineUpload(machine, media.applyAttachments)
 *
 * Entrambi accettano un componente opzionale: `capturePhoto(comp)` e
 * `uploadDocument(categoria, comp)` archiviano il file sotto quel pezzo
 * senza toglierlo dalla macchina.
 */

import { useCallback, useState } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './useToast'
import { useHaptic } from './useHaptic'
import { useImageCompressor } from './useImageCompressor'

// Il picker nativo non ha un modo affidabile di dire "ho annullato" su
// tutti i browser: `cancel` è recente, e dove manca la promise resta
// pendente. Non è un problema — nessun effetto collaterale, e il tap
// successivo crea un input nuovo.
function pickFile(accept, { camera = false } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    if (camera) input.capture = 'environment'
    input.onchange = e => resolve(e.target.files?.[0] || null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

// Il tasto Scatta è collegato come handler diretto (`onClick={capturePhoto}`):
// senza questo filtro il MouseEvent del click arriverebbe qui travestito da
// componente, e il file finirebbe archiviato sotto un pezzo inesistente.
const asComponent = (c) => (c && c.id ? c : null)

export function useMachineUpload(machine, onAttachments) {
  const { user } = useAuth()
  const toast = useToast()
  const haptic = useHaptic()
  const { compress, makeThumbnail } = useImageCompressor()
  const [busy, setBusy] = useState(false)

  const addFile = useCallback(async (file, { type, category, component = null }) => {
    if (!file || !machine?.id) return
    setBusy(true)
    const toastId = toast.loading(type === 'pdf' ? 'Carico il documento…' : 'Carico la foto…')
    try {
      let toUpload = file
      if (type === 'image') {
        const result = await compress(file)
        toUpload = result.file
      }

      const stamp = component
        ? `${machine.id}/${component.id}/${category}-${Date.now()}`
        : `${machine.id}/${category}-${Date.now()}`
      const url = await db.uploadFile('attachments', stamp, toUpload)

      // Miniatura: la griglia carica decine di riquadri insieme, e una
      // foto compressa pesa comunque centinaia di KB. Se fallisce, la
      // galleria usa l'originale.
      let thumbUrl = null
      if (type === 'image') {
        try {
          const thumb = await makeThumbnail(toUpload)
          if (thumb) thumbUrl = await db.uploadFile('attachments', `${stamp}-thumb`, thumb)
        } catch { /* opzionale */ }
      }

      const next = await db.addMachineAttachment(machine.id, {
        url,
        thumb_url: thumbUrl,
        type,
        category,
        name: file.name || (type === 'pdf' ? 'Documento' : 'Foto dal campo'),
        // Il file resta della macchina — galleria, cartelle e biblioteca AI
        // lo vedono come prima. `component_id` dice solo sotto quale pezzo
        // è archiviato; il server verifica che il componente sia suo.
        component_id: component?.id || null,
        component_name: component?.name || null,
        // Serve solo al fallback demo mode: in supabase l'autore lo
        // mette il server, che è l'unico a sapere chi è loggato davvero.
        uploaded_by_name: user?.name || null,
      })
      onAttachments?.(next)

      haptic.success()
      toast.dismiss(toastId)
      toast.success(
        component
          ? `${type === 'pdf' ? 'Documento' : 'Foto'} su ${component.name}`
          : (type === 'pdf' ? 'Documento caricato' : 'Foto aggiunta alla macchina'))

      // I PDF entrano nella biblioteca AI della macchina. In sottofondo:
      // chi è davanti all'impianto non deve aspettare l'indicizzazione.
      if (type === 'pdf') {
        db.queueMachineReindex(machine.id).catch(e =>
          console.warn('[useMachineUpload] reindex fallito:', e.message))
      }
    } catch (e) {
      toast.dismiss(toastId)
      toast.error('Errore: ' + (e.message || 'riprova'))
    }
    setBusy(false)
  }, [machine?.id, user?.name, compress, makeThumbnail, onAttachments, toast, haptic])

  // `component` è opzionale ovunque: senza, il file è della macchina —
  // che resta il caso normale.
  const capturePhoto = useCallback(async (component = null) => {
    haptic.light()
    const file = await pickFile('image/*', { camera: true })
    if (file) await addFile(file, { type: 'image', category: 'foto', component: asComponent(component) })
  }, [addFile, haptic])

  const uploadDocument = useCallback(async (category, component = null) => {
    haptic.light()
    const file = await pickFile('application/pdf,image/*')
    if (!file) return
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) {
      toast.error('Formato non supportato: carica un PDF o una foto')
      return
    }
    await addFile(file, { type: isPdf ? 'pdf' : 'image', category, component: asComponent(component) })
  }, [addFile, haptic, toast])

  return { capturePhoto, uploadDocument, busy }
}

import { supabase } from './_client'

export const storage = {
  async uploadFile(bucket, path, file) {
    if (supabase) {
      const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg'
      const safeName = (path || `uploads/${Date.now()}`)
        .replace(/[^a-zA-Z0-9/_.-]/g, '_')
        .replace(/_{2,}/g, '_')
      const uniquePath = `${safeName}.${ext}`
      const { error } = await supabase.storage.from(bucket).upload(uniquePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/octet-stream',
      })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(uniquePath)
      return publicUrl
    }
    // Fallback: converte in base64 per localStorage
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  },

  // Upload audio vocale (webm/opus) nel bucket attachments.
  // Naming: voice-updates/{ticketId}/{timestamp}-{userId}.webm
  // Ritorna l'URL pubblico (o data:URL in demo mode).
  async uploadVoiceAudio(blob, ticketId, userId) {
    const ts = Date.now()
    const safeTicket = (ticketId || 'unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '_')
    const safeUser = (userId || 'unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '_')
    const file = new File([blob], `voice-${ts}.webm`, { type: 'audio/webm' })
    const path = `voice-updates/${safeTicket}/${ts}-${safeUser}`
    return this.uploadFile('attachments', path, file)
  },
}

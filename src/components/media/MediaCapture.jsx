import { useState, useRef } from 'react'
import { Camera, Video, Mic, Image, Square, X } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { useImageCompressor } from '../../hooks/useImageCompressor'

export default function MediaCapture({ media, onChange }) {
  const [recording, setRecording] = useState(false)
  const [audioTime, setAudioTime] = useState(0)
  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const timerRef = useRef(null)

  const toast = useToast()
  const haptic = useHaptic()
  const { compress, formatSize } = useImageCompressor()

  const uploadWithFallback = async (path, file) => {
    try {
      return await db.uploadFile('attachments', path, file)
    } catch {
      // Fallback: prova bucket 'reports' se 'attachments' non esiste
      return await db.uploadFile('reports', path, file)
    }
  }

  const addFile = async (file, type) => {
    const loadingId = toast.loading('Caricamento allegato...')
    try {
      let fileToUpload = file

      // Comprimi automaticamente le immagini
      if (type === 'photo') {
        const result = await compress(file)
        fileToUpload = result.file
        if (result.wasCompressed) {
          toast.dismiss(loadingId)
          toast.info(`Foto compressa: ${formatSize(result.originalSize)} → ${formatSize(result.compressedSize)}`)
          // Riapri loading per upload
          const uploadId = toast.loading('Upload in corso...')
          const url = await uploadWithFallback(`${Date.now()}-${fileToUpload.name}`, fileToUpload)
          onChange([...media, { id: Date.now().toString(), type, name: fileToUpload.name, url, size: fileToUpload.size }])
          toast.dismiss(uploadId)
          toast.success('Foto aggiunta')
          haptic.success()
          return
        }
      }

      const url = await uploadWithFallback(`${Date.now()}-${fileToUpload.name}`, fileToUpload)
      onChange([...media, { id: Date.now().toString(), type, name: fileToUpload.name, url, size: fileToUpload.size }])
      toast.dismiss(loadingId)
      toast.success(`${type === 'photo' ? 'Foto' : type === 'video' ? 'Video' : 'Audio'} aggiunto`)
      haptic.success()
    } catch (err) {
      toast.dismiss(loadingId)
      toast.error('Errore caricamento: ' + (err.message || 'riprova'))
    }
  }

  const removeFile = (id) => {
    haptic.light()
    onChange(media.filter(x => x.id !== id))
    toast.info('Allegato rimosso')
  }

  const handleCapture = (accept, type) => {
    haptic.light()
    const input = document.createElement('input')
    input.type = 'file'; input.accept = accept; input.capture = 'environment'
    input.onchange = (e) => { if (e.target.files[0]) addFile(e.target.files[0], type) }
    input.click()
  }

  const handleGallery = () => {
    haptic.light()
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*,video/*'; input.multiple = true
    input.onchange = (e) => {
      Array.from(e.target.files).forEach(f => addFile(f, f.type.startsWith('video') ? 'video' : 'photo'))
    }
    input.click()
  }

  const startAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunks.current = []
      recorder.ondataavailable = (e) => audioChunks.current.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        addFile(new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' }), 'audio')
        stream.getTracks().forEach(t => t.stop())
        clearInterval(timerRef.current); setAudioTime(0)
      }
      recorder.start(); mediaRecorder.current = recorder; setRecording(true); setAudioTime(0)
      timerRef.current = setInterval(() => setAudioTime(t => t + 1), 1000)
      haptic.medium()
      toast.info('🎙 Registrazione avviata...')
    } catch {
      toast.error('Permesso microfono negato')
    }
  }

  const stopAudio = () => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop()
      setRecording(false)
      haptic.success()
    }
  }

  const fmt = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`

  return (
    <div>
      <label className="block text-base text-muted mb-[2.5vw] uppercase tracking-wider font-semibold">
        Allegati {media.length > 0 && <span className="text-violet-400">({media.length})</span>}
      </label>

      {/* Capture buttons — 2x2 responsive */}
      <div className="grid grid-cols-2 gap-[2.5vw] mb-[3vw]">
        {[
          { action: () => handleCapture('image/*', 'photo'), label: '📷 Foto', color: '#7c6aff' },
          { action: () => handleCapture('video/*', 'video'), label: '🎥 Video', color: '#22c55e' },
          { action: recording ? stopAudio : startAudio, label: recording ? `⏹ ${fmt(audioTime)}` : '🎤 Audio', color: recording ? '#ef4444' : '#f59e0b' },
          { action: handleGallery, label: '🖼 Galleria', color: '#a855f7' },
        ].map(({ action, label, color }, i) => (
          <button key={i} type="button" onClick={action}
            className={`flex items-center justify-center gap-2 py-[4vw] bg-surface-2/60 active:bg-surface-2 rounded-2xl border border-token/50 transition-colors press-scale text-base font-semibold text-secondary ${recording && i === 2 ? 'animate-pulse border-red-500/50 bg-red-500/10' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Preview */}
      {media.length > 0 && (
        <div className="space-y-[2vw]">
          {media.map(m => (
            <div key={m.id} className="flex items-center gap-[3vw] bg-surface-2/50 rounded-2xl p-[3vw] border border-token/30 animate-fade-in">
              <div className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl overflow-hidden shrink-0 bg-surface-2 flex items-center justify-center">
                {m.type === 'photo' ? (
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">{m.type === 'video' ? '🎥' : '🎤'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base text-themed truncate">{m.name}</p>
                <p className="text-sm text-faint">{m.type === 'photo' ? 'Foto' : m.type === 'video' ? 'Video' : 'Audio'}</p>
              </div>
              <button type="button" onClick={() => removeFile(m.id)}
                className="w-[40px] h-[40px] min-w-[40px] rounded-xl flex items-center justify-center bg-red-500/10 active:bg-red-500/30 text-red-400 press-scale">
                <X size={22} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

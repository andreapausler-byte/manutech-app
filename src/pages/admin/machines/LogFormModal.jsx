import { useState } from 'react'
import { Modal, Input, Textarea, Button } from '../../../components/ui'
import { Building, Plus, FileText, Image as ImageIcon, Trash2, ExternalLink, Upload } from 'lucide-react'
import { db } from '../../../lib/supabase'
import toast from 'react-hot-toast'

export default function LogFormModal({ open, onClose, form, setForm, plans, components, onSave, editing = false }) {
  const [uploading, setUploading] = useState(false)
  const media = Array.isArray(form.media) ? form.media : []

  const uploadMedia = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,image/*'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      setUploading(true)
      try {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        const isImage = file.type.startsWith('image/')
        const url = await db.uploadFile('attachments', `log-media/${Date.now()}-${file.name}`, file)
        const newItem = {
          type: isPdf ? 'pdf' : (isImage ? 'image' : 'document'),
          category: form.is_external ? 'intervento_esterno' : 'intervento_interno',
          name: file.name,
          url,
        }
        setForm(f => ({ ...f, media: [...(f.media || []), newItem] }))
        toast.success('File allegato')
      } catch (err) {
        toast.error('Errore upload: ' + (err.message || 'riprova'))
      }
      setUploading(false)
    }
    input.click()
  }

  const removeMedia = (index) => {
    setForm(f => ({ ...f, media: (f.media || []).filter((_, i) => i !== index) }))
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Modifica Intervento' : 'Registra Intervento'} size="md">
      <div className="space-y-4">
        {/* Toggle Intervento esterno */}
        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, is_external: !f.is_external }))}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${form.is_external ? 'border-amber-500/40 bg-amber-500/10' : 'border-token bg-surface-2'}`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${form.is_external ? 'bg-amber-500/20' : 'bg-white/[0.04]'}`}>
            <Building size={16} className={form.is_external ? 'text-amber-400' : 'text-faint'} />
          </div>
          <div className="flex-1 text-left">
            <p className={`text-sm font-bold ${form.is_external ? 'text-amber-300' : 'text-themed'}`}>
              Intervento di ditta esterna
            </p>
            <p className="text-[10px] text-faint">
              {form.is_external ? 'ON — compila i dati ditta sotto' : "Attiva se l'intervento è stato fatto da un fornitore esterno"}
            </p>
          </div>
          <div className={`w-10 h-6 rounded-full relative transition-all ${form.is_external ? 'bg-amber-500' : 'bg-surface-3'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.is_external ? 'right-0.5' : 'left-0.5'}`} />
          </div>
        </button>

        {/* Campi ditta esterna */}
        {form.is_external && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
            <Input
              label="Nome ditta esterna *"
              placeholder="Es: Rossi Manutenzioni srl"
              value={form.contractor_name || ''}
              onChange={e => setForm(f => ({ ...f, contractor_name: e.target.value }))}
            />
            <Input
              label="Rif. bolla / ordine"
              placeholder="Es: 2026-042"
              value={form.contractor_reference || ''}
              onChange={e => setForm(f => ({ ...f, contractor_reference: e.target.value }))}
            />
          </div>
        )}

        <Input
          label="Titolo *"
          placeholder={form.is_external ? 'Taratura sensori pressione' : 'Lubrificazione completata'}
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        />

        <Textarea
          label="Descrizione"
          placeholder="Cosa è stato fatto..."
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />

        {components?.length > 0 && (
          <div>
            <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Componente</label>
            <select
              value={form.component_id || ''}
              onChange={e => setForm(f => ({ ...f, component_id: e.target.value || '' }))}
              className="w-full input-field rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="">Intero macchinario</option>
              {components.map(c => <option key={c.id} value={c.id}>{c.name}{c.type ? ` (${c.type})` : ''}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Durata (minuti)"
            placeholder="60"
            type="number"
            value={form.duration_minutes}
            onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
          />
          <Input
            label="Ricambi"
            placeholder="Filtro XF-420"
            value={form.parts_replaced}
            onChange={e => setForm(f => ({ ...f, parts_replaced: e.target.value }))}
          />
        </div>

        {editing && (
          <Input
            label="Data e ora intervento"
            type="datetime-local"
            value={form.performed_at || ''}
            onChange={e => setForm(f => ({ ...f, performed_at: e.target.value }))}
          />
        )}

        {/* Allegati (rapporti PDF, foto) */}
        <div>
          <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">
            Allegati (rapporti, certificati, foto)
          </label>
          <div className="space-y-2">
            {media.map((m, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 bg-surface-1 rounded-xl">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${m.type === 'pdf' ? 'bg-red-500/15' : 'bg-violet-500/15'}`}>
                  {m.type === 'pdf' ? <FileText size={15} className="text-red-400" /> : <ImageIcon size={15} className="text-violet-400" />}
                </div>
                <span className="flex-1 text-sm text-themed truncate">{m.name}</span>
                <a href={m.url} target="_blank" rel="noopener" className="p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-violet-400">
                  <ExternalLink size={13} />
                </a>
                <button type="button" onClick={() => removeMedia(i)} className="p-1.5 rounded-lg hover:bg-red-500/15 text-faint hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={uploadMedia}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:border-violet-500/40 hover:text-violet-400 hover:bg-violet-500/5 transition-all disabled:opacity-50"
            >
              {uploading ? <Upload size={14} className="animate-pulse" /> : <Plus size={14} />}
              {uploading ? 'Caricamento...' : 'Allega rapporto, certificato o foto'}
            </button>
            <p className="text-[10px] text-faint">
              🤖 I PDF allegati vengono indicizzati dall'assistente AI per rispondere a domande su questo intervento.
            </p>
          </div>
        </div>

        {form.plan_id ? (
          <p className="text-xs text-violet-400 bg-violet-500/10 rounded-xl px-3 py-2">
            ✓ Piano: {plans.find(p => p.id === form.plan_id)?.name}
          </p>
        ) : (
          <p className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
            ⚡ Manutenzione straordinaria
          </p>
        )}

        <Button
          onClick={onSave}
          className="w-full"
          size="lg"
          disabled={!form.title.trim() || (form.is_external && !(form.contractor_name || '').trim())}
        >
          {editing ? 'Salva modifiche' : 'Registra intervento'}
        </Button>
      </div>
    </Modal>
  )
}

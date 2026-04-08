import { Modal, Input, Textarea, Button } from '../../../components/ui'
import { Camera, FileText, Video, Trash2, X, MapPin } from 'lucide-react'

export default function MachineFormModal({ open, onClose, editing, form, setForm, photoUrl, setPhotoUrl, attachments, setAttachments, areas = [], onSave, onUploadPhoto, onAddAttachment }) {
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Modifica Macchinario' : 'Nuovo Macchinario'} size="lg">
      <div className="space-y-4">
        <Input label="Nome *" placeholder="Es. Pressa idraulica #3" value={form.name} onChange={e => set('name', e.target.value)} />

        {/* Area selector */}
        {areas.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5 flex items-center gap-1.5">
              <MapPin size={12} /> Area Impianto
            </label>
            <select className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 outline-none"
              value={form.area_id || ''} onChange={e => set('area_id', e.target.value)}>
              <option value="">Nessuna area</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input label="Costruttore" placeholder="Siemens" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
          <Input label="Modello" placeholder="XR-500" value={form.model} onChange={e => set('model', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Matricola" placeholder="SN-2024-0042" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          <Input label="Anno" placeholder="2022" type="number" value={form.year} onChange={e => set('year', e.target.value)} />
          <Input label="Reparto / Linea" placeholder="Linea 1" value={form.department} onChange={e => set('department', e.target.value)} />
        </div>
        <Textarea label="Descrizione" placeholder="Note..." value={form.description} onChange={e => set('description', e.target.value)} />
        <div>
          <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Foto</label>
          {photoUrl ? <div className="relative w-32 h-24 rounded-xl overflow-hidden border border-token"><img src={photoUrl} alt="" className="w-full h-full object-cover" /><button onClick={() => setPhotoUrl('')} className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"><X size={12} className="text-white" /></button></div>
            : <button onClick={onUploadPhoto} className="flex items-center gap-2 px-4 py-3 bg-surface-2 border border-token rounded-xl text-sm text-muted hover:text-white transition-all"><Camera size={16} /> Carica foto</button>}
        </div>
        <div>
          <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Documentazione ({attachments.length})</label>
          <div className="flex gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => onAddAttachment('pdf')}><FileText size={14} className="text-red-400" /> PDF</Button>
            <Button size="sm" variant="outline" onClick={() => onAddAttachment('video')}><Video size={14} className="text-emerald-400" /> Video</Button>
          </div>
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 bg-surface-2 rounded-lg p-2.5 mb-1.5">
              {a.type === 'pdf' ? <FileText size={14} className="text-red-400" /> : <Video size={14} className="text-emerald-400" />}
              <span className="text-sm text-secondary flex-1 truncate">{a.name}</span>
              <button onClick={() => setAttachments(at => at.filter((_, j) => j !== i))} className="text-faint hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <Button onClick={onSave} className="w-full" size="lg" disabled={!form.name.trim()}>{editing ? 'Salva' : 'Crea'}</Button>
      </div>
    </Modal>
  )
}

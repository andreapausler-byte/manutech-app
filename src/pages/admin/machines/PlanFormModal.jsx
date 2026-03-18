import { Modal, Input, Textarea, Button } from '../../../components/ui'

const FREQ_PRESETS = [
  { label: 'Settim.', days: 7 }, { label: 'Mensile', days: 30 }, { label: 'Trim.', days: 90 },
  { label: 'Sem.', days: 180 }, { label: 'Annuale', days: 365 },
]

export default function PlanFormModal({ open, onClose, editing, form, setForm, users, onSave }) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Modifica Piano' : 'Nuovo Piano'} size="md">
      <div className="space-y-4">
        <Input label="Attività *" placeholder="Lubrificazione cuscinetti" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <div>
          <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Frequenza</label>
          <div className="flex gap-2 mb-3 flex-wrap">
            {FREQ_PRESETS.map(p => <button key={p.days} onClick={() => setForm(f => ({ ...f, frequency_days: p.days }))}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${parseInt(form.frequency_days) === p.days ? 'bg-violet-600 text-white' : 'bg-surface-2 text-muted'}`}>{p.label}</button>)}
          </div>
          <div className="flex items-center gap-2"><span className="text-sm text-faint">Ogni</span>
            <input type="number" value={form.frequency_days} onChange={e => setForm(f => ({ ...f, frequency_days: e.target.value }))} className="w-20 input-field rounded-xl px-3 py-2 text-sm text-center" />
            <span className="text-sm text-faint">giorni</span></div>
        </div>
        <div>
          <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Responsabile</label>
          <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
            <option value="">Non assegnato</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </div>
        <Textarea label="Istruzioni" placeholder="Come eseguire..." value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} />
        <Button onClick={onSave} className="w-full" size="lg" disabled={!form.name.trim()}>{editing ? 'Salva' : 'Crea Piano'}</Button>
      </div>
    </Modal>
  )
}

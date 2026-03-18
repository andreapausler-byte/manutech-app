import { Modal, Input, Textarea, Button } from '../../../components/ui'

export default function LogFormModal({ open, onClose, form, setForm, plans, onSave }) {
  return (
    <Modal open={open} onClose={onClose} title="Registra Intervento" size="md">
      <div className="space-y-4">
        <Input label="Titolo *" placeholder="Lubrificazione completata" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        <Textarea label="Descrizione" placeholder="Cosa è stato fatto..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Durata (minuti)" placeholder="60" type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
          <Input label="Ricambi" placeholder="Filtro XF-420" value={form.parts_replaced} onChange={e => setForm(f => ({ ...f, parts_replaced: e.target.value }))} />
        </div>
        {form.plan_id ? <p className="text-xs text-violet-400 bg-violet-500/10 rounded-xl px-3 py-2">✓ Piano: {plans.find(p => p.id === form.plan_id)?.name}</p>
          : <p className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">⚡ Manutenzione straordinaria</p>}
        <Button onClick={onSave} className="w-full" size="lg" disabled={!form.title.trim()}>Registra</Button>
      </div>
    </Modal>
  )
}

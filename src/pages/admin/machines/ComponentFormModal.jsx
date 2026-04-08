import { Modal, Input, Button } from '../../../components/ui'

export default function ComponentFormModal({ open, onClose, editing, form, setForm, onSave }) {
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Modifica Componente' : 'Nuovo Componente'} size="md">
      <div className="space-y-4">
        <Input label="Nome componente *" placeholder="es. Pompa Dosatrice" value={form.name} onChange={e => set('name', e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Tipo" placeholder="es. Pompa, Motore, Valvola" value={form.type} onChange={e => set('type', e.target.value)} />
          <Input label="Costruttore" placeholder="es. SKF" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Modello" placeholder="es. XR-200" value={form.model} onChange={e => set('model', e.target.value)} />
          <Input label="Matricola" placeholder="es. SN-12345" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          <Input label="Anno" type="number" placeholder="2024" value={form.year} onChange={e => set('year', e.target.value ? parseInt(e.target.value) : '')} />
        </div>

        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">Note</label>
          <textarea className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed placeholder:text-faint focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 outline-none resize-none"
            rows={2} placeholder="Note opzionali sul componente..."
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <Button onClick={onSave} disabled={!form.name?.trim()} className="w-full">
          {editing ? 'Salva Modifiche' : 'Aggiungi Componente'}
        </Button>
      </div>
    </Modal>
  )
}

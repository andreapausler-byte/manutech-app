/**
 * AreaManagerModal — Gestione aree impianto
 * CRUD inline: aggiungi, modifica, elimina aree con nome + colore
 */

import { useState } from 'react'
import { Modal, Input, Button } from '../../../components/ui'
import { Plus, Edit, Trash2, Check, X, GripVertical } from 'lucide-react'

const AREA_COLORS = [
  { value: '#ef4444', label: 'Rosso' },
  { value: '#f59e0b', label: 'Ambra' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#3b82f6', label: 'Blu' },
  { value: '#7c6aff', label: 'Viola' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#8b5cf6', label: 'Indaco' },
]

export default function AreaManagerModal({ open, onClose, areas, onSave, onDelete }) {
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#7c6aff')
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#7c6aff')

  const startEdit = (area) => {
    setEditId(area.id)
    setEditName(area.name)
    setEditColor(area.color || '#7c6aff')
  }

  const cancelEdit = () => { setEditId(null); setEditName(''); setEditColor('#7c6aff') }

  const saveEdit = () => {
    if (!editName.trim()) return
    onSave(editId, { name: editName.trim(), color: editColor })
    cancelEdit()
  }

  const addNew = () => {
    if (!newName.trim()) return
    onSave(null, { name: newName.trim(), color: newColor, sort_order: areas.length })
    setNewName('')
    setNewColor('#7c6aff')
  }

  return (
    <Modal open={open} onClose={onClose} title="Gestisci Aree Impianto" size="md">
      <div className="space-y-4">
        <p className="text-xs text-faint">Le aree raggruppano i macchinari per zona dello stabilimento.</p>

        {/* Existing areas */}
        {areas.length > 0 && (
          <div className="space-y-2">
            {areas.map(area => (
              <div key={area.id} className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl group">
                {editId === area.id ? (
                  <>
                    <div className="w-5 h-5 rounded-full shrink-0 ring-2 ring-white/20" style={{ background: editColor }} />
                    <Input value={editName} onChange={e => setEditName(e.target.value)}
                      className="flex-1" placeholder="Nome area"
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                      autoFocus />
                    <div className="flex gap-1">
                      {AREA_COLORS.map(c => (
                        <button key={c.value} onClick={() => setEditColor(c.value)}
                          className={`w-5 h-5 rounded-full transition-all ${editColor === c.value ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'}`}
                          style={{ background: c.value }} title={c.label} />
                      ))}
                    </div>
                    <button onClick={saveEdit} className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400"><Check size={14} /></button>
                    <button onClick={cancelEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-faint"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 rounded-full shrink-0" style={{ background: area.color || '#7c6aff' }} />
                    <span className="text-sm font-medium text-themed flex-1">{area.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(area)} className="p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-white"><Edit size={13} /></button>
                      <button onClick={() => { if (confirm(`Eliminare l'area "${area.name}"? Le macchine verranno spostate in "Non assegnate".`)) onDelete(area.id) }}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new area */}
        <div className="flex items-center gap-3 p-3 bg-surface-2/50 border border-dashed border-token/50 rounded-xl">
          <div className="w-5 h-5 rounded-full shrink-0" style={{ background: newColor }} />
          <input type="text" placeholder="Nuova area..." value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNew() }}
            className="flex-1 bg-transparent text-sm text-themed placeholder:text-faint outline-none" />
          <div className="flex gap-1">
            {AREA_COLORS.map(c => (
              <button key={c.value} onClick={() => setNewColor(c.value)}
                className={`w-4 h-4 rounded-full transition-all ${newColor === c.value ? 'ring-2 ring-white scale-110' : 'opacity-40 hover:opacity-100'}`}
                style={{ background: c.value }} />
            ))}
          </div>
          <button onClick={addNew} disabled={!newName.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-all">
            <Plus size={13} /> Aggiungi
          </button>
        </div>
      </div>
    </Modal>
  )
}

import { Modal, Button } from '../../../components/ui'
import { Upload } from 'lucide-react'

export default function CSVImportModal({ open, onClose, csvData, users, defaultUser, onDefaultUserChange, onImport }) {
  return (
    <Modal open={open} onClose={onClose} title="Importa Piani da CSV" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted">Trovati <strong className="text-white">{csvData.length}</strong> piani.</p>
        <div>
          <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Responsabile default</label>
          <select value={defaultUser} onChange={e => onDefaultUserChange(e.target.value)} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
            <option value="">Non assegnato</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </div>
        <div className="bg-surface-2 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full">
            <thead><tr className="border-b border-token"><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Attività</th><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Freq.</th><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Note</th></tr></thead>
            <tbody>{csvData.map((r, i) => <tr key={i} className="border-b border-token/30"><td className="px-4 py-2.5 text-sm text-themed">{r.name}</td><td className="px-4 py-2.5 text-sm text-muted">{r.frequency_days}g</td><td className="px-4 py-2.5 text-sm text-faint truncate max-w-[200px]">{r.instructions||'—'}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="flex gap-3">
          <Button onClick={onImport} className="flex-1" size="lg"><Upload size={16} /> Importa {csvData.length} piani</Button>
          <Button variant="outline" onClick={onClose} className="flex-1" size="lg">Annulla</Button>
        </div>
        <div className="bg-surface-2/50 rounded-xl p-3">
          <p className="text-[11px] text-faint uppercase tracking-wider mb-1">Formato CSV</p>
          <code className="text-xs text-muted block">attività;frequenza_giorni;note</code>
        </div>
      </div>
    </Modal>
  )
}

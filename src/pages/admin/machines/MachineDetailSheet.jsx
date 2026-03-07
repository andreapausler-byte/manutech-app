import { STATUS, SEVERITY, timeAgo } from '../../../lib/constants'
import { Badge } from '../../../components/ui'
import {
  Edit, Trash2, FileText, Video, Cog, X, QrCode, Download, Camera,
  Calendar, Hash, Factory, Building, ClipboardList, ChevronRight,
  Wrench, Shield, Plus, Play, Upload
} from 'lucide-react'

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', daysLeft }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#f59e0b', daysLeft }
  return { label: `Tra ${daysLeft}g`, color: '#22c55e', daysLeft }
}

export default function MachineDetailSheet({
  sel, qrDataUrl, plans, logs, planLastLogs, reports,
  detailTab, setDetailTab,
  onClose, onEdit, onDownloadQR,
  onOpenPlanForm, onDeletePlan, onOpenLogForm,
  onHandleCSVFile,
}) {
  const getReportsForMachine = (name) => reports.filter(r => r.machine === name)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-surface-1 border border-token rounded-2xl w-full max-w-[95vw] animate-fade-in shadow-2xl overflow-hidden" style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-token">
          <div className="flex items-center gap-3 min-w-0">
            <Cog size={20} className="text-blue-400 shrink-0" />
            <h2 className="text-lg font-bold text-themed truncate">{sel.name}</h2>
            {sel.department && <span className="text-sm text-faint px-2 py-0.5 bg-surface-2 rounded-lg shrink-0">{sel.department}</span>}
            {sel.manufacturer && <span className="text-xs text-muted shrink-0">{sel.manufacturer}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onEdit(sel)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-all"><Edit size={14} /> Modifica</button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white"><X size={22} /></button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-0" style={{ height: 'calc(85vh - 65px)' }}>
          {/* COL LEFT: Info + QR */}
          <div className="col-span-3 border-r border-token overflow-y-auto p-4 space-y-3">
            {sel.photo_url ? (
              <div className="rounded-xl overflow-hidden border border-token aspect-video"><img src={sel.photo_url} alt="" className="w-full h-full object-cover" /></div>
            ) : (
              <button onClick={() => onEdit(sel)} className="rounded-xl border border-dashed border-token/50 bg-surface-2/30 aspect-video flex flex-col items-center justify-center text-faint hover:border-blue-500/30 hover:text-blue-400 transition-all cursor-pointer">
                <Camera size={24} className="mb-1 opacity-40" />
                <span className="text-xs">Aggiungi foto</span>
              </button>
            )}

            <div className="space-y-1.5">
              {[
                { icon: Factory, label: 'Costruttore', value: sel.manufacturer },
                { icon: Cog, label: 'Modello', value: sel.model },
                { icon: Hash, label: 'Matricola', value: sel.serial_number },
                { icon: Calendar, label: 'Anno', value: sel.year },
                { icon: Building, label: 'Reparto', value: sel.department },
              ].filter(f => f.value).map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2.5 p-2.5 bg-surface-2 rounded-xl">
                  <Icon size={14} className="text-faint shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-faint uppercase tracking-wider">{label}</p>
                    <p className="text-sm text-themed font-medium truncate">{value}</p>
                  </div>
                </div>
              ))}
              {![sel.manufacturer, sel.model, sel.serial_number, sel.year].some(Boolean) && (
                <p className="text-xs text-faint text-center py-3">Nessun dato tecnico. <button onClick={() => onEdit(sel)} className="text-blue-400 underline">Compila scheda</button></p>
              )}
            </div>

            {sel.description && <div><p className="text-[10px] text-faint uppercase tracking-wider mb-1">Descrizione</p><p className="text-xs text-secondary leading-relaxed">{sel.description}</p></div>}

            <div className="bg-white rounded-xl p-3 flex flex-col items-center">
              {qrDataUrl ? <img src={qrDataUrl} alt="QR" className="w-28 h-28" /> : <div className="w-28 h-28 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /></div>}
              <p className="text-black font-bold text-xs mt-1.5">{sel.name}</p>
            </div>
            <button onClick={() => onDownloadQR(sel)} className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all"><Download size={14} /> Scarica QR</button>

            {sel.attachments?.length > 0 && (
              <div>
                <p className="text-[10px] text-faint uppercase tracking-wider mb-1.5">Documenti ({sel.attachments.length})</p>
                {sel.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener" className="flex items-center gap-2 p-2 bg-surface-2 rounded-lg text-xs hover:bg-surface-3 transition-colors mb-1">
                    {a.type === 'pdf' ? <FileText size={13} className="text-red-400" /> : <Video size={13} className="text-emerald-400" />}
                    <span className="text-secondary flex-1 truncate">{a.name}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* COL RIGHT: Tabs */}
          <div className="col-span-9 flex flex-col overflow-hidden">
            <div className="flex border-b border-token shrink-0">
              <button onClick={() => setDetailTab('plans')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'plans' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-faint hover:text-secondary'}`}>
                <Shield size={16} /> Piani Manutenzione
                {plans.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{plans.length}</span>}
              </button>
              <button onClick={() => setDetailTab('logs')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'logs' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-faint hover:text-secondary'}`}>
                <Wrench size={16} /> Registro Interventi
                {logs.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{logs.length}</span>}
              </button>
              <button onClick={() => setDetailTab('reports')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'reports' ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5' : 'text-faint hover:text-secondary'}`}>
                <ClipboardList size={16} /> Segnalazioni
                {getReportsForMachine(sel.name).length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{getReportsForMachine(sel.name).length}</span>}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* PLANS */}
              {detailTab === 'plans' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted">{plans.length} piani</p>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-xl text-sm font-medium cursor-pointer transition-all">
                        <Upload size={14} /> CSV
                        <input type="file" accept=".csv,.txt" className="hidden" onChange={onHandleCSVFile} />
                      </label>
                      <button onClick={() => onOpenPlanForm()} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all"><Plus size={14} /> Nuovo Piano</button>
                    </div>
                  </div>

                  {plans.length === 0 ? (
                    <div className="text-center py-16"><Shield size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessun piano configurato</p><p className="text-xs text-faint mt-1">Crea un piano o importa da CSV</p></div>
                  ) : (
                    <div className="space-y-3">
                      {plans.map(plan => {
                        const light = getTrafficLight(plan, planLastLogs[plan.id])
                        return (
                          <div key={plan.id} className="bg-surface-2 rounded-xl p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded-full shrink-0" style={{ background: light.color, boxShadow: `0 0 8px ${light.color}40` }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white">{plan.name}</p>
                                <p className="text-xs text-faint mt-0.5">Ogni {plan.frequency_days}g · {plan.assigned_to_name || 'Non assegnato'}</p>
                              </div>
                              <span className="text-xs font-bold px-2.5 py-1 rounded-lg shrink-0" style={{ background: light.color + '18', color: light.color }}>{light.label}</span>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => onOpenLogForm(plan.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-faint hover:text-emerald-400" title="Registra intervento"><Play size={14} /></button>
                                <button onClick={() => onOpenPlanForm(plan)} className="p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-white"><Edit size={13} /></button>
                                <button onClick={() => onDeletePlan(plan.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={13} /></button>
                              </div>
                            </div>
                            {plan.instructions && <p className="text-xs text-muted mt-2 pl-7 leading-relaxed">{plan.instructions}</p>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* LOGS */}
              {detailTab === 'logs' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted">{logs.length} interventi</p>
                    <button onClick={() => onOpenLogForm()} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all"><Plus size={14} /> Registra</button>
                  </div>
                  {logs.length === 0 ? (
                    <div className="text-center py-16"><Wrench size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessun intervento</p></div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map(log => (
                        <div key={log.id} className="flex items-start gap-3 p-4 bg-surface-2 rounded-xl">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.type === 'programmata' ? 'bg-blue-500/15' : 'bg-amber-500/15'}`}>
                            {log.type === 'programmata' ? <Shield size={14} className="text-blue-400" /> : <Wrench size={14} className="text-amber-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-white">{log.title}</p>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${log.type === 'programmata' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                {log.type === 'programmata' ? 'Programmata' : 'Straordinaria'}
                              </span>
                            </div>
                            {log.description && <p className="text-xs text-muted mt-1">{log.description}</p>}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-faint flex-wrap">
                              <span>{log.performed_by_name || '—'}</span>
                              <span>{timeAgo(log.performed_at)}</span>
                              {log.duration_minutes && <span>⏱ {log.duration_minutes} min</span>}
                              {log.parts_replaced && <span>🔩 {log.parts_replaced}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* REPORTS */}
              {detailTab === 'reports' && (() => {
                const mr = getReportsForMachine(sel.name)
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-surface-2 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-white">{mr.length}</p><p className="text-[11px] text-faint">Totali</p></div>
                      <div className="bg-surface-2 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-amber-400">{mr.filter(r => r.status !== 'risolta').length}</p><p className="text-[11px] text-faint">Attive</p></div>
                      <div className="bg-surface-2 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{mr.filter(r => r.status === 'risolta').length}</p><p className="text-[11px] text-faint">Risolte</p></div>
                    </div>
                    {mr.length === 0 ? <div className="text-center py-16"><ClipboardList size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessuna segnalazione</p></div>
                    : <div className="space-y-2">{mr.map(r => { const s = STATUS[r.status]||STATUS.aperta; const sv = SEVERITY[r.severity]||SEVERITY.media; return (
                      <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                        <div className="flex-1 min-w-0"><p className="text-sm text-themed font-medium truncate">{r.title}</p><p className="text-[11px] text-faint">{r.created_by_name} · {timeAgo(r.created_at)}</p></div>
                        <Badge {...sv} />
                      </div>) })}</div>}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

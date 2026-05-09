import { useEffect, useState } from 'react'
import { Modal, Button } from './ui'
import { SUPPLIER_SPECIALTIES, SUPPLIER_AVAILABILITY } from '../lib/constants'
import { db } from '../lib/supabase'
import { inferSupplierSpecialties, compareSpecialties } from '../lib/supplierInference'
import { Phone, MessageCircle, Mail, MapPin, Globe, Clock, Euro, User, FileText, Edit2, Trash2, Briefcase, History, AlertCircle } from 'lucide-react'

export default function SupplierDetailModal({ open, onClose, supplier, profile, onEdit, onDelete }) {
  const [inferred, setInferred] = useState([])
  const [matchedOrders, setMatchedOrders] = useState(0)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Carica gli ordini ricambi e calcola le specialità inferite quando il
  // modal si apre. On-demand: nessun cron, nessuna scrittura.
  useEffect(() => {
    if (!open || !supplier) {
      setInferred([])
      setMatchedOrders(0)
      return
    }
    let cancelled = false
    setLoadingHistory(true)
    db.getSparePartOrders().then(orders => {
      if (cancelled) return
      const result = inferSupplierSpecialties({
        supplierId: supplier.id || null,
        supplierName: profile?.company_name || supplier.name || null,
        orders: orders || [],
      })
      setInferred(result.inferred)
      setMatchedOrders(result.matchedOrdersCount)
    }).catch(err => {
      console.warn('[SupplierDetailModal] inference failed:', err?.message)
    }).finally(() => {
      if (!cancelled) setLoadingHistory(false)
    })
    return () => { cancelled = true }
  }, [open, supplier, profile?.company_name])

  if (!supplier) return null

  const specialties = profile?.specialties || []
  const hasAdminExtras = profile?.address || profile?.website || profile?.admin_contact || profile?.iban
  const availability = profile?.availability ? SUPPLIER_AVAILABILITY[profile.availability] : null
  const drift = inferred.length > 0 ? compareSpecialties(specialties, inferred) : { onlyInferred: [], onlyManual: [], common: [] }

  return (
    <Modal open={open} onClose={onClose} title="Scheda Fornitore">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: 'var(--color-primary-glow)' }}>
            🚚
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              {profile?.company_name || supplier.name}
            </h3>
            {profile?.referent_name && (
              <p className="text-sm flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                <User size={13} /> {profile.referent_name}
              </p>
            )}
            {(profile?.vat_number || profile?.tax_code) && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
                {profile.vat_number && <>P.IVA {profile.vat_number}</>}
                {profile.vat_number && profile.tax_code && ' · '}
                {profile.tax_code && <>CF {profile.tax_code}</>}
              </p>
            )}
          </div>
        </div>

        {/* Specialità */}
        {specialties.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Specialità</p>
            <div className="flex flex-wrap gap-2">
              {specialties.map(key => {
                const s = SUPPLIER_SPECIALTIES[key]
                if (!s) return null
                return (
                  <span key={key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{ background: s.color + '20', color: s.color }}>
                    <span>{s.icon}</span> {s.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Specialità inferite dallo storico ricambi */}
        {!loadingHistory && inferred.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
              <History size={12} /> Dallo storico ricambi
              <span className="font-normal lowercase" style={{ color: 'var(--color-text-faint)' }}>
                · {matchedOrders} {matchedOrders === 1 ? 'ordine' : 'ordini'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {inferred.map(({ specialty, count }) => {
                const s = SUPPLIER_SPECIALTIES[specialty]
                if (!s) return null
                const isNew = drift.onlyInferred.includes(specialty)
                return (
                  <span key={specialty}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{
                      background: s.color + '12',
                      color: s.color,
                      border: `1px dashed ${s.color}40`,
                    }}>
                    <span>{s.icon}</span> {s.label}
                    <span className="font-normal" style={{ opacity: 0.7 }}>· {count}</span>
                    {isNew && (
                      <span className="ml-1 px-1 py-px rounded text-[9px] font-bold uppercase tracking-wide"
                        style={{ background: s.color + '25', color: s.color }}>
                        nuovo
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
            {drift.onlyInferred.length > 0 && specialties.length > 0 && (
              <p className="text-[11px] mt-2 flex items-start gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                <AlertCircle size={11} className="shrink-0 mt-0.5" />
                Lo storico mostra specialità non incluse nella scheda. Valuta se aggiornarla.
              </p>
            )}
          </div>
        )}

        {/* Contatti rapidi */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Contatti</p>
          <div className="space-y-2">
            {profile?.phone && (
              <QuickAction href={`tel:${profile.phone}`} icon={<Phone size={18} />} color="#22c55e" label="Chiama" value={profile.phone} />
            )}
            {profile?.whatsapp && (
              <QuickAction
                href={`https://wa.me/${profile.whatsapp.replace(/[^\d+]/g, '')}`}
                icon={<MessageCircle size={18} />}
                color="#25d366"
                label="WhatsApp"
                value={profile.whatsapp}
                external
              />
            )}
            {profile?.email_public && (
              <QuickAction href={`mailto:${profile.email_public}`} icon={<Mail size={18} />} color="#7c6aff" label="Email" value={profile.email_public} />
            )}
          </div>
        </div>

        {/* Operatività */}
        {(profile?.city || availability || profile?.hourly_rate != null) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Operatività</p>
            <div className="grid grid-cols-2 gap-2">
              {profile.city && <InfoTile icon={<MapPin size={14} />} label="Zona" value={profile.city} />}
              {availability && <InfoTile icon={<Clock size={14} />} label="Reperibilità" value={availability.label} />}
              {profile.hourly_rate != null && <InfoTile icon={<Euro size={14} />} label="Tariffa oraria" value={`€ ${Number(profile.hourly_rate).toFixed(2)}/h`} />}
            </div>
          </div>
        )}

        {/* Note */}
        {profile?.notes && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
              <FileText size={12} /> Note
            </p>
            <div className="rounded-xl p-3 text-sm whitespace-pre-wrap"
              style={{ background: 'var(--color-surface-0)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {profile.notes}
            </div>
          </div>
        )}

        {/* Altri dati */}
        {hasAdminExtras && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Altri dati</p>
            <div className="space-y-1.5 text-sm">
              {profile.address && <DetailRow icon={<MapPin size={13} />} label="Indirizzo" value={profile.address} />}
              {profile.website && (
                <DetailRow icon={<Globe size={13} />} label="Sito"
                  value={<a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>{profile.website}</a>} />
              )}
              {profile.admin_contact && <DetailRow icon={<Briefcase size={13} />} label="Amministrazione" value={profile.admin_contact} />}
              {profile.iban && <DetailRow icon={<FileText size={13} />} label="IBAN" value={<code className="text-xs">{profile.iban}</code>} />}
            </div>
          </div>
        )}

        {/* Se non c'è profilo esteso */}
        {!profile && (
          <div className="rounded-xl p-4 text-sm text-center"
            style={{ background: 'var(--color-surface-0)', border: '1px dashed var(--color-border)', color: 'var(--color-text-muted)' }}>
            Fornitore senza anagrafica estesa. Clicca "Modifica" per aggiungere i dettagli.
          </div>
        )}

        {/* Azioni admin */}
        <div className="flex gap-2 pt-2">
          <Button onClick={onEdit} className="flex-1" variant="secondary"><Edit2 size={16} /> Modifica</Button>
          {onDelete && (
            <Button onClick={onDelete} variant="danger"><Trash2 size={16} /></Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function QuickAction({ href, icon, color, label, value, external }) {
  return (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-3 rounded-xl p-3 transition-all press-scale hover:opacity-90"
      style={{ background: color + '15', border: `1px solid ${color}30` }}>
      <span style={{ color }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</p>
        <p className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{value}</p>
      </div>
    </a>
  )
}

function InfoTile({ icon, label, value }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-0)', border: '1px solid var(--color-border)' }}>
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
        {icon} {label}
      </p>
      <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{value}</p>
    </div>
  )
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider mr-2" style={{ color: 'var(--color-text-muted)' }}>{label}:</span>
        <span className="text-sm break-words" style={{ color: 'var(--color-text)' }}>{value}</span>
      </div>
    </div>
  )
}

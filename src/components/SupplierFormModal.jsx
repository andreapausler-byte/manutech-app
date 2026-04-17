import { useState, useEffect } from 'react'
import { Modal, Input, Button } from './ui'
import { SUPPLIER_SPECIALTIES, SUPPLIER_AVAILABILITY } from '../lib/constants'
import { Phone, MessageCircle, Mail, Wrench, ChevronDown, ChevronUp } from 'lucide-react'

const EMPTY_FORM = {
  company_name: '',
  referent_name: '',
  vat_number: '',
  tax_code: '',
  phone: '',
  whatsapp: '',
  email_public: '',
  specialties: [],
  city: '',
  availability: '',
  hourly_rate: '',
  notes: '',
  address: '',
  website: '',
  admin_contact: '',
  iban: '',
}

export default function SupplierFormModal({ open, onClose, initialProfile = null, initialName = '', onSubmit, submitting = false }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initialProfile) {
      setForm({
        ...EMPTY_FORM,
        ...initialProfile,
        specialties: initialProfile.specialties || [],
        hourly_rate: initialProfile.hourly_rate?.toString() || '',
      })
    } else {
      setForm({ ...EMPTY_FORM, company_name: initialName || '' })
    }
    setShowAdvanced(false)
  }, [open, initialProfile, initialName])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleSpecialty = (key) => {
    setForm(f => ({
      ...f,
      specialties: f.specialties.includes(key)
        ? f.specialties.filter(s => s !== key)
        : [...f.specialties, key],
    }))
  }

  const canSubmit =
    form.company_name.trim().length > 0 &&
    form.specialties.length > 0 &&
    (form.phone.trim() || form.whatsapp.trim() || form.email_public.trim())

  const handleSubmit = () => {
    if (!canSubmit) return
    const payload = {
      ...form,
      company_name: form.company_name.trim(),
      referent_name: form.referent_name.trim() || null,
      vat_number: form.vat_number.trim() || null,
      tax_code: form.tax_code.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      email_public: form.email_public.trim() || null,
      city: form.city.trim() || null,
      availability: form.availability || null,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
      notes: form.notes.trim() || null,
      address: form.address.trim() || null,
      website: form.website.trim() || null,
      admin_contact: form.admin_contact.trim() || null,
      iban: form.iban.trim() || null,
    }
    onSubmit(payload)
  }

  const isEdit = !!initialProfile

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifica Fornitore' : 'Nuovo Fornitore Esterno'}>
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
        {/* Anagrafica */}
        <Section title="Anagrafica">
          <Input
            label="Ragione sociale *"
            placeholder="Es. Elettromeccanica Bianchi SRL"
            value={form.company_name}
            onChange={e => set('company_name', e.target.value)}
          />
          <Input
            label="Nome referente"
            placeholder="Es. Marco Bianchi"
            value={form.referent_name}
            onChange={e => set('referent_name', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="P.IVA" placeholder="12345678901" value={form.vat_number} onChange={e => set('vat_number', e.target.value)} />
            <Input label="Codice Fiscale" placeholder="(opz.)" value={form.tax_code} onChange={e => set('tax_code', e.target.value)} />
          </div>
        </Section>

        {/* Contatti */}
        <Section title="Contatti" subtitle="Almeno uno obbligatorio">
          <InputWithIcon icon={<Phone size={16} />} label="Telefono" type="tel" placeholder="+39 ..." value={form.phone} onChange={v => set('phone', v)} />
          <InputWithIcon icon={<MessageCircle size={16} />} label="WhatsApp" type="tel" placeholder="+39 ..." value={form.whatsapp} onChange={v => set('whatsapp', v)} />
          <InputWithIcon icon={<Mail size={16} />} label="Email" type="email" placeholder="info@fornitore.it" value={form.email_public} onChange={v => set('email_public', v)} />
        </Section>

        {/* Specialità */}
        <Section title="Specialità *" subtitle="Seleziona una o più aree di intervento">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(SUPPLIER_SPECIALTIES).map(([key, { label, icon }]) => {
              const active = form.specialties.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSpecialty(key)}
                  className="flex items-center gap-2 p-3 rounded-xl border text-left transition-all press-scale"
                  style={{
                    borderColor: active ? 'var(--color-border-active)' : 'var(--color-border)',
                    background: active ? 'var(--color-primary-glow)' : 'transparent',
                    color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                  }}
                >
                  <span className="text-lg">{icon}</span>
                  <span className="text-sm font-medium">{label}</span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Operatività */}
        <Section title="Operatività">
          <Input
            label="Città / Zona"
            placeholder="Es. Brescia, Bergamo"
            value={form.city}
            onChange={e => set('city', e.target.value)}
          />
          <div>
            <label className="block text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Reperibilità
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(SUPPLIER_AVAILABILITY).map(([key, { label, icon }]) => {
                const active = form.availability === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set('availability', active ? '' : key)}
                    className="flex items-center gap-2 p-3 rounded-xl border text-left transition-all press-scale"
                    style={{
                      borderColor: active ? 'var(--color-border-active)' : 'var(--color-border)',
                      background: active ? 'var(--color-primary-glow)' : 'transparent',
                      color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                    }}
                  >
                    <span>{icon}</span>
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </Section>

        {/* Commerciale */}
        <Section title="Commerciale">
          <Input
            label="Tariffa oraria (€)"
            type="number"
            placeholder="Es. 45.00"
            value={form.hourly_rate}
            onChange={e => set('hourly_rate', e.target.value)}
          />
          <div>
            <label className="block text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Note
            </label>
            <textarea
              placeholder="Es. chiede preavviso 24h, fatture elettroniche, ecc."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-[15px] border focus:outline-none focus:border-violet-500/50 resize-none"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface-0)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        </Section>

        {/* Altri dati — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Altri dati (opzionali)
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-3 animate-fade-in">
              <Input label="Indirizzo sede" placeholder="Via Roma 12, 25100 Brescia" value={form.address} onChange={e => set('address', e.target.value)} />
              <Input label="Sito web" placeholder="https://www.fornitore.it" value={form.website} onChange={e => set('website', e.target.value)} />
              <Input label="Contatto amministrativo" placeholder="Es. Anna — amministrazione@..." value={form.admin_contact} onChange={e => set('admin_contact', e.target.value)} />
              <Input label="IBAN" placeholder="IT..." value={form.iban} onChange={e => set('iban', e.target.value)} />
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="pt-2 sticky bottom-0" style={{ background: 'var(--color-surface-1)' }}>
          {!canSubmit && (
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-faint)' }}>
              Compila ragione sociale, almeno un contatto e almeno una specialità.
            </p>
          )}
          <Button onClick={handleSubmit} className="w-full" size="lg" disabled={!canSubmit || submitting}>
            {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
              <><Wrench size={18} /> {isEdit ? 'Salva modifiche' : 'Crea Fornitore'}</>}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>{title}</h4>
        {subtitle && <p className="text-xs" style={{ color: 'var(--color-text-faint)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function InputWithIcon({ icon, label, value, onChange, ...rest }) {
  return (
    <div>
      <label className="block text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 focus-within:border-violet-500/50"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-0)' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{icon}</span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-transparent focus:outline-none text-[15px]"
          style={{ color: 'var(--color-text)' }}
          {...rest}
        />
      </div>
    </div>
  )
}

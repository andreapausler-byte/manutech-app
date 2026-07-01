import { X, GripHorizontal } from 'lucide-react'
import { useDraggable } from '../../hooks/useDraggable'
import { formatTicketId } from '../../lib/constants'
import { useToast } from '../../hooks/useToast'

// ── Skeleton Components (re-export) ──────────────────────
export { SkeletonBlock, SkeletonKPIGrid, SkeletonReportCard, SkeletonReportList, SkeletonDashboard, SkeletonReportsPage } from './Skeleton'

// ── TicketIdBadge ────────────────────────────────────────
// Badge cliccabile che mostra il TK-id e lo copia in clipboard al tap.
// Applica sempre `slashed-zero tabular-nums` per distinguere 0 da 8/O in
// font sans-serif. Accetta `style` per integrarsi con stilizzazioni di
// contesto (lista, header, tabella admin, casi simili).
export function TicketIdBadge({ report, style, className = '', stopPropagation = true }) {
  const toast = useToast()
  const tk = formatTicketId(report)
  if (!tk) return null

  // Deep-link diretto alla segnalazione: richiede l'UUID `report.id`, che
  // esiste solo quando `report` è un oggetto segnalazione completo. In alcuni
  // call site (es. casi simili) arriva solo il display_id come stringa: in
  // quel caso copiamo il solo TK-id, senza link rotto.
  const reportId = report && typeof report === 'object' ? report.id : null

  const copy = async (e) => {
    if (stopPropagation && e) e.stopPropagation()
    const link = reportId ? `${window.location.origin}/reports/${reportId}` : null
    const text = link ? `${tk}\n${link}` : tk
    try {
      await navigator.clipboard.writeText(text)
      toast.success(link ? 'Ticket e link copiati' : `${tk} copiato`)
    } catch {
      toast.error('Impossibile copiare')
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      copy(e)
    }
  }

  // span (non button) per evitare HTML invalido quando il TK-id è
  // dentro card cliccabili (ReportsList, SimilarCasesLivePanel) che
  // usano <button> come container — il nesting button>button è
  // proibito dallo spec.
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={copy}
      onKeyDown={onKeyDown}
      aria-label={`Copia ${tk}`}
      title={`Copia ${tk}`}
      className={`press-scale ${className}`}
      style={{
        cursor: 'pointer',
        fontVariantNumeric: 'slashed-zero tabular-nums',
        ...style,
      }}
    >
      {tk}
    </span>
  )
}

// ── Badge ────────────────────────────────────────────────
export function Badge({ label, color, bg, icon }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        fontSize: 12, padding: '3px 8px', borderRadius: 6, fontWeight: 500,
        background: bg || color + '18', color, whiteSpace: 'nowrap',
      }}
    >
      {icon && <span style={{ marginRight: 3 }}>{icon}</span>}
      {label}
    </span>
  )
}

// ── Button ───────────────────────────────────────────────
export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed press-scale'

  const variants = {
    primary: 'text-white focus:ring-blue-500',
    success: 'text-white focus:ring-emerald-500',
    danger: 'text-white focus:ring-red-500',
    ghost: 'bg-transparent hover:bg-white/10 focus:ring-gray-500',
    outline: 'border hover:border-gray-400 focus:ring-gray-500',
  }

  const variantStyles = {
    primary: { background: 'var(--color-primary)', boxShadow: 'var(--shadow-glow-primary)' },
    success: { background: 'var(--color-success)', boxShadow: '0 2px 12px rgba(34, 197, 94, 0.25)' },
    danger: { background: 'var(--color-danger)', boxShadow: '0 2px 12px rgba(239, 68, 68, 0.25)' },
    ghost: { color: 'var(--color-text-secondary)' },
    outline: { borderColor: 'var(--color-border-hover)', color: 'var(--color-text-secondary)' },
  }

  const sizes = {
    sm: 'px-5 py-3 text-base gap-2',
    md: 'px-6 py-4 text-lg gap-2',
    lg: 'px-8 py-5 text-xl gap-3',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      style={{ focusRingOffset: 'var(--color-bg)', ...variantStyles[variant] }}
      {...props}
    >
      {children}
    </button>
  )
}

// ── Input ────────────────────────────────────────────────
export function Input({ label, error, className = '', id, ...props }) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)
  const errorId = error && inputId ? `${inputId}-error` : undefined
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-base uppercase tracking-wider font-semibold mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className="w-full rounded-2xl px-[4vw] py-[3.5vw] md:px-5 md:py-4 text-lg text-white focus:outline-none focus:ring-1 transition-colors"
        style={{
          background: 'var(--color-surface-0)',
          border: `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
          color: 'var(--color-text)',
        }}
        onFocus={e => {
          e.target.style.borderColor = error ? '#ef4444' : 'var(--color-primary)'
          e.target.style.boxShadow = error ? 'none' : '0 0 0 3px var(--color-primary-glow)'
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? '#ef4444' : 'var(--color-border)'
          e.target.style.boxShadow = 'none'
        }}
        {...props}
      />
      {error && <p id={errorId} className="text-red-400 text-sm mt-1.5" role="alert">{error}</p>}
    </div>
  )
}

// ── Select ───────────────────────────────────────────────
export function Select({ label, options, className = '', ...props }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-base uppercase tracking-wider font-semibold mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </label>
      )}
      <select
        className="w-full rounded-2xl px-5 py-4 text-lg text-white focus:outline-none focus:ring-1 transition-colors"
        style={{
          background: 'var(--color-surface-0)',
          border: '1px solid var(--color-border)',
        }}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Textarea ─────────────────────────────────────────────
export function Textarea({ label, className = '', ...props }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-base uppercase tracking-wider font-semibold mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </label>
      )}
      <textarea
        className="w-full rounded-2xl px-5 py-4 text-lg text-white focus:outline-none focus:ring-1 transition-colors resize-none"
        style={{
          background: 'var(--color-surface-0)',
          border: '1px solid var(--color-border)',
        }}
        rows={4}
        {...props}
      />
    </div>
  )
}

// ── Modal — glassmorphism + draggable su desktop ────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }) {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const { position, dragProps } = useDraggable({ enabled: isDesktop && open })
  if (!open) return null

  const titleId = title ? `modal-title-${title.toLowerCase().replace(/\s+/g, '-').slice(0, 30)}` : undefined
  const maxW = size === 'lg' ? 640 : size === 'sm' ? 380 : 500

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}
      style={{ alignItems: isDesktop ? 'center' : 'flex-end' }}>
      {/* Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        animation: 'fadeIn 0.2s ease both',
      }} aria-hidden="true" />
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(isDesktop ? dragProps : {})}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'var(--color-surface-1)',
          borderRadius: isDesktop ? 20 : '20px 20px 0 0',
          width: '100%', maxWidth: maxW,
          maxHeight: isDesktop ? '80vh' : '90vh', overflowY: 'auto',
          padding: '20px 18px 30px',
          boxShadow: 'var(--shadow-xl)',
          animation: isDesktop ? 'fadeIn 0.2s ease both' : 'slideUp 0.3s ease both',
          transform: isDesktop ? `translate(${position.x}px, ${position.y}px)` : undefined,
          border: isDesktop ? '1px solid var(--color-border)' : undefined,
          ...(isDesktop ? dragProps.style : {}),
        }}
      >
        {/* Title bar */}
        {isDesktop && title ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GripHorizontal size={16} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
              <h2 id={titleId} style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{title}</h2>
            </div>
            <button onClick={onClose} aria-label="Chiudi" style={{
              padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--color-surface-3)', color: 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={18} />
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
            </div>
            {title && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--color-border)',
              }}>
                <h2 id={titleId} style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{title}</h2>
                <button onClick={onClose} aria-label="Chiudi" style={{
                  padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'var(--color-surface-3)', color: 'var(--color-text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <X size={18} />
                </button>
              </div>
            )}
          </>
        )}
        <div>{children}</div>
      </div>
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="text-center py-20 px-6" role="status">
      <div className="text-6xl mb-4" aria-hidden="true">{icon}</div>
      <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-secondary)' }}>{title}</h3>
      {subtitle && <p className="text-base" style={{ color: 'var(--color-text-faint)' }}>{subtitle}</p>}
    </div>
  )
}

// ── Loading Spinner ──────────────────────────────────────
export function Spinner({ size = 32 }) {
  return (
    <div className="flex items-center justify-center p-10" role="status" aria-label="Caricamento">
      <div
        className="border-2 rounded-full animate-spin"
        style={{ width: size, height: size, borderColor: 'var(--color-border)', borderTopColor: 'var(--color-primary)' }}
        aria-hidden="true"
      />
    </div>
  )
}

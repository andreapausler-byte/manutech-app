import { X } from 'lucide-react'

// ── Skeleton Components (re-export) ──────────────────────
export { SkeletonBlock, SkeletonKPIGrid, SkeletonReportCard, SkeletonReportList, SkeletonDashboard, SkeletonReportsPage } from './Skeleton'

// ── Badge ────────────────────────────────────────────────
export function Badge({ label, color, bg }) {
  return (
    <span
      className="inline-flex items-center px-3 py-1.5 rounded-full text-base font-bold tracking-wide whitespace-nowrap"
      style={{ background: bg || color + '18', color }}
    >
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
export function Input({ label, error, className = '', ...props }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-base uppercase tracking-wider font-semibold mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </label>
      )}
      <input
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
      {error && <p className="text-red-400 text-sm mt-1.5">{error}</p>}
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

// ── Modal — glassmorphism ────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw] max-h-[95vh]',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative glass-heavy rounded-2xl w-full ${sizes[size]} max-h-[85vh] overflow-y-auto animate-scale-in`}
        style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-xl)' }}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between p-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="text-xl font-extrabold text-white tracking-tight">{title}</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors" style={{ color: 'var(--color-text-muted)' }}>
              <X size={22} />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="text-center py-20 px-6">
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-secondary)' }}>{title}</h3>
      {subtitle && <p className="text-base" style={{ color: 'var(--color-text-faint)' }}>{subtitle}</p>}
    </div>
  )
}

// ── Loading Spinner ──────────────────────────────────────
export function Spinner({ size = 32 }) {
  return (
    <div className="flex items-center justify-center p-10">
      <div
        className="border-2 rounded-full animate-spin"
        style={{ width: size, height: size, borderColor: 'var(--color-border)', borderTopColor: 'var(--color-primary)' }}
      />
    </div>
  )
}

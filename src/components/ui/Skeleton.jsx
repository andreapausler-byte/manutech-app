/**
 * Skeleton — Componenti placeholder animati per loading states
 * 
 * Replicano la forma esatta delle card reali per un caricamento percepito più veloce.
 * Usano shimmer animation definita in index.css
 */

// ── Base Skeleton Block ──────────────────────────────────
export function SkeletonBlock({ className = '', style = {} }) {
  return (
    <div
      className={`skeleton-shimmer rounded-2xl ${className}`}
      style={style}
    />
  )
}

// ── Skeleton per KPI Card (Dashboard 2x2 grid) ──────────
export function SkeletonKPIGrid() {
  return (
    <div className="grid grid-cols-2 gap-[3vw] mb-[5vw]">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="card-elevated rounded-2xl p-[3.5vw] flex items-center gap-[3vw]"
          style={{ animationDelay: `${i * 80}ms` }}>
          <SkeletonBlock className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-8 w-12 rounded-lg" />
            <SkeletonBlock className="h-4 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Skeleton per Report Card (lista segnalazioni) ────────
export function SkeletonReportCard({ index = 0 }) {
  return (
    <div
      className="w-full flex items-center gap-[3vw] card-elevated rounded-2xl px-[4vw] py-[3.5vw]"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Status dot container */}
      <SkeletonBlock className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl shrink-0" />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SkeletonBlock className="h-5 flex-1 max-w-[60%] rounded-lg" />
          <SkeletonBlock className="h-4 w-12 rounded-md shrink-0" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-16 rounded-full" />
          <SkeletonBlock className="h-4 w-8 rounded-md" />
        </div>
      </div>

      {/* Chevron placeholder */}
      <SkeletonBlock className="w-5 h-5 rounded shrink-0" />
    </div>
  )
}

// ── Skeleton per lista completa di Report ────────────────
export function SkeletonReportList({ count = 5 }) {
  return (
    <div className="space-y-[2.5vw]">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonReportCard key={i} index={i} />
      ))}
    </div>
  )
}

// ── Skeleton per Dashboard completa ──────────────────────
export function SkeletonDashboard() {
  return (
    <div className="px-[4vw] pt-[4vw] pb-4">
      {/* Welcome text */}
      <SkeletonBlock className="h-8 w-48 rounded-xl mb-[4vw]" />

      {/* KPI Grid */}
      <SkeletonKPIGrid />

      {/* Section header */}
      <div className="flex items-center justify-between mb-[2.5vw]">
        <SkeletonBlock className="h-5 w-28 rounded-lg" />
        <SkeletonBlock className="h-4 w-16 rounded-md" />
      </div>

      {/* Report list */}
      <SkeletonReportList count={4} />
    </div>
  )
}

// ── Skeleton per Search + Filtri (ReportsList) ───────────
export function SkeletonReportsPage() {
  return (
    <div className="px-[4vw] pt-[3vw] pb-4 space-y-[3vw]">
      {/* Search bar */}
      <SkeletonBlock className="h-14 w-full rounded-2xl" />

      {/* Filter chips 2x2 */}
      <div className="grid grid-cols-2 gap-[2.5vw]">
        {[1, 2, 3, 4].map(i => (
          <SkeletonBlock key={i} className="h-12 rounded-2xl" />
        ))}
      </div>

      {/* Report cards */}
      <SkeletonReportList count={5} />
    </div>
  )
}

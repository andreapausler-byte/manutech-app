/**
 * MachineGallery — Foto e video della macchina, raccolti nel tempo
 *
 * Le foto scattate in chat, allegate alle segnalazioni o ai log di
 * manutenzione restano sepolte nel punto in cui sono nate. Qui tornano
 * a galla tutte insieme, in ordine cronologico, con l'origine visibile
 * e un tap per aprirle a schermo intero.
 *
 * Due viste sullo stesso dato:
 *   · Tutte        — il feed completo, per cercare
 *   · In evidenza  — la galleria curata (machines.attachments), per trovare
 *
 * Vive dentro il tab Foto della scheda macchina: il feed arriva dall'alto
 * (`media`) perché la barra a schede deve contare le foto anche quando il
 * tab è chiuso.
 */

import { useMemo, useState } from 'react'
import {
  Play, Star, ArrowUpRight, Camera,
  MessageSquare, AlertTriangle, Wrench, CalendarClock, FileText, X,
} from 'lucide-react'
import { timeAgo } from '../../lib/constants'
import { galleryFileName } from '../../lib/mediaFile'
import { useMachineMedia } from '../../hooks/useMachineMedia'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import MediaLightbox from '../media/MediaLightbox'
import VideoPlayer from '../media/VideoPlayer'

const SOURCE_META = {
  chat: { label: 'Chat', icon: MessageSquare, color: '#00d4ff' },
  segnalazione: { label: 'Segnalazione', icon: AlertTriangle, color: '#ffaa2c' },
  manutenzione: { label: 'Manutenzione', icon: Wrench, color: '#3ddc84' },
  intervento: { label: 'Intervento', icon: CalendarClock, color: '#7c6aff' },
  scheda: { label: 'Scheda', icon: FileText, color: '#8b96a8' },
  campo: { label: 'Dal campo', icon: Camera, color: '#7c6aff' },
}

const FILTERS = [
  { id: 'all', label: 'Tutte' },
  { id: 'featured', label: 'In evidenza' },
  { id: 'recent', label: 'Ultimi 30g' },
]

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export default function MachineGallery({ machine, onOpenReport, media = null, onCapture, capturing }) {
  const toast = useToast()
  const haptic = useHaptic()
  // Se il feed arriva dall'alto l'hook locale gira a vuoto, invece di
  // rifare la stessa query una seconda volta.
  const ownMedia = useMachineMedia(media ? null : machine)
  const { items, loading, loadingMore, hasMore, loadMore, toggleFeature } = media || ownMedia

  const [filter, setFilter] = useState('all')
  // Il taglio dei 30 giorni si fissa al tap sul filtro: Date.now() dentro
  // il render sarebbe impuro (e cambierebbe a ogni re-render).
  const [recentSince, setRecentSince] = useState(0)
  const [lightbox, setLightbox] = useState(null)   // { images, index }
  const [videoItem, setVideoItem] = useState(null)
  const [busyUrl, setBusyUrl] = useState(null)

  const featuredCount = useMemo(() => items.filter(i => i.is_featured).length, [items])

  const visible = useMemo(() => {
    if (filter === 'featured') return items.filter(i => i.is_featured)
    if (filter === 'recent') {
      return items.filter(i => i.taken_at && new Date(i.taken_at).getTime() >= recentSince)
    }
    return items
  }, [items, filter, recentSince])

  // Il tasto Scatta sta solo nella vista completa: dentro "In evidenza"
  // o "Ultimi 30g" una foto nuova sparirebbe subito dal filtro attivo.
  const showCapture = !!onCapture && filter === 'all'

  const openItem = (item) => {
    haptic.light()
    if (item.type === 'video') { setVideoItem(item); return }
    const photos = visible.filter(i => i.type !== 'video')
    const index = photos.findIndex(p => p.url === item.url)
    // Nome parlante: il file scaricato deve dire da che macchina e da quale
    // segnalazione viene, non `1712345678-IMG_0042.jpg`.
    setLightbox({
      images: photos.map((p, i) => ({ url: p.url, name: galleryFileName(p, machine?.name, i) })),
      index: Math.max(index, 0),
    })
  }

  const handleToggleFeature = async (item) => {
    haptic.medium()
    setBusyUrl(item.url)
    try {
      await toggleFeature(item)
      toast.success(item.is_featured ? 'Rimossa dalla galleria' : 'Aggiunta alla galleria della macchina')
    } catch (e) {
      toast.error('Errore: ' + (e.message || 'riprova'))
    }
    setBusyUrl(null)
  }

  return (
    <div
      className="flex flex-col gap-[3vw]"
      style={{ padding: '4vw' }}
    >
      {/* ═══ Filtri ═══ */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map(f => {
          const active = filter === f.id
          const count = f.id === 'featured' ? featuredCount : null
          return (
            <button
              key={f.id}
              onClick={() => {
                haptic.light()
                if (f.id === 'recent') setRecentSince(Date.now() - THIRTY_DAYS_MS)
                setFilter(f.id)
              }}
              className="shrink-0 h-[56px] rounded-2xl text-base font-bold press-scale transition-colors"
              style={{
                paddingLeft: 20,
                paddingRight: 20,
                background: active ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: active ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              {f.label}{count !== null ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-[3vw]">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="aspect-square rounded-2xl skeleton-shimmer" />
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <>
          {showCapture && (
            <div className="grid grid-cols-2 gap-[3vw]">
              <CaptureTile onCapture={onCapture} busy={capturing} />
            </div>
          )}
          <p className="text-base text-faint text-center leading-relaxed" style={{ paddingTop: '6vw', paddingBottom: '10vw' }}>
            {filter === 'featured'
              ? 'Nessuna foto in evidenza. Tocca la stella su una foto per tenerla qui.'
              : filter === 'recent'
                ? 'Nessuna foto negli ultimi 30 giorni.'
                : 'Nessuna foto o video su questa macchina. Scatta la prima qui sopra, oppure allegane una a una segnalazione: finisce qui da sola.'}
          </p>
        </>
      )}

      {!loading && visible.length > 0 && (
        <div className="grid grid-cols-2 gap-[3vw]">
          {showCapture && <CaptureTile onCapture={onCapture} busy={capturing} />}
          {visible.map(item => (
            <MediaTile
              key={item.url}
              item={item}
              busy={busyUrl === item.url}
              onOpen={() => openItem(item)}
              onToggleFeature={() => handleToggleFeature(item)}
              onOpenSource={
                onOpenReport && item.source_id && (item.source === 'chat' || item.source === 'segnalazione')
                  ? () => { haptic.light(); onOpenReport(item.source_id) }
                  : null
              }
            />
          ))}
        </div>
      )}

      {!loading && hasMore && filter === 'all' && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full h-[68px] card-interactive rounded-2xl text-base font-bold text-muted press-scale"
        >
          {loadingMore ? 'Caricamento…' : 'Carica altre foto'}
        </button>
      )}

      {lightbox && (
        <MediaLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {videoItem && (
        <div className="fixed inset-0 z-[90] bg-black/95 backdrop-blur-md flex flex-col animate-fade-in">
          <div className="flex items-center justify-end px-4 py-3">
            <button
              onClick={() => setVideoItem(null)}
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
              aria-label="Chiudi video"
            >
              <X size={22} className="text-white" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 pb-8">
            <div className="w-full max-w-2xl">
              <VideoPlayer src={videoItem.url} name={videoItem.name} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── CaptureTile ──────────────────────────────────────────
//
// Stessa forma di una miniatura, così sta nella griglia senza rompere
// il ritmo: chi cerca la fotocamera la trova dove sono le foto.

function CaptureTile({ onCapture, busy }) {
  return (
    <button
      onClick={onCapture}
      disabled={busy}
      aria-label="Scatta una foto per questa macchina"
      className="aspect-square rounded-2xl flex flex-col items-center justify-center gap-[2vw] press-scale transition-colors active:bg-surface-3"
      style={{
        border: '1px dashed var(--color-border-hover)',
        background: 'var(--color-surface-1)',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy
        ? <div className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-primary)' }} />
        : <Camera size={34} strokeWidth={1.6} style={{ color: 'var(--color-primary)' }} />}
      <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
        {busy ? 'Carico…' : 'Scatta'}
      </span>
    </button>
  )
}


// ── MediaTile ────────────────────────────────────────────

function MediaTile({ item, busy, onOpen, onToggleFeature, onOpenSource }) {
  const meta = SOURCE_META[item.source] || SOURCE_META.scheda
  const SourceIcon = meta.icon

  return (
    <div className="card-elevated rounded-2xl overflow-hidden">
      <button
        onClick={onOpen}
        className="relative block w-full aspect-square press-scale"
        aria-label={`Apri ${item.type === 'video' ? 'video' : 'foto'} da ${meta.label}`}
      >
        <img
          src={item.thumb_url || item.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          style={{ background: 'var(--color-surface-2)' }}
        />
        {item.type === 'video' && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-12 h-12 rounded-full bg-black/55 flex items-center justify-center">
              <Play size={22} className="text-white" fill="currentColor" />
            </span>
          </span>
        )}
        <span
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
          style={{ background: 'rgba(0,0,0,0.55)', color: meta.color }}
        >
          <SourceIcon size={11} /> {meta.label}
        </span>
      </button>

      <div className="flex items-center gap-1 px-[2.5vw] py-[2vw]">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-themed truncate">{item.source_label || '—'}</p>
          <p className="text-[11px] text-faint truncate">
            {item.author_name ? `${item.author_name} · ` : ''}{item.taken_at ? timeAgo(item.taken_at) : ''}
          </p>
        </div>

        <button
          onClick={onToggleFeature}
          disabled={busy}
          aria-label={item.is_featured ? 'Togli dalla galleria' : 'Metti in evidenza'}
          aria-pressed={item.is_featured}
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 press-scale"
          style={{ background: item.is_featured ? 'rgba(245,158,11,0.16)' : 'var(--color-surface-2)' }}
        >
          <Star
            size={16}
            className={item.is_featured ? 'text-amber-400' : 'text-faint'}
            fill={item.is_featured ? 'currentColor' : 'none'}
          />
        </button>

        {onOpenSource && (
          <button
            onClick={onOpenSource}
            aria-label="Apri la segnalazione di origine"
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 press-scale"
            style={{ background: 'var(--color-surface-2)' }}
          >
            <ArrowUpRight size={16} className="text-faint" />
          </button>
        )}
      </div>
    </div>
  )
}

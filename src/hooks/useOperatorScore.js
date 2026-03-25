/**
 * useOperatorScore — Sistema punteggio gamification per operatori
 *
 * Punti:
 *  - Report creato:                +10
 *  - Quick report (bonus velocità): +5
 *  - Foto allegata (ciascuna):      +3
 *  - Severità alta/critica:         +5
 *  - Descrizione dettagliata >50c:  +2
 *  - Streak giornaliero (per giorno consecutivo): +2
 *
 * Livelli:
 *  - Bronzo:   0-99
 *  - Argento:  100-249
 *  - Oro:      250-499
 *  - Platino:  500-999
 *  - Diamante: 1000+
 *
 * Badge: traguardi sbloccabili basati su attività cumulativa
 */

import { useMemo } from 'react'

export const SCORE_RULES = {
  reportCreated: 10,
  quickReportBonus: 5,
  photoBonus: 3,
  highSeverityBonus: 5,
  detailedDescBonus: 2,
  streakBonusPerDay: 2,
}

export const LEVELS = [
  { id: 'bronzo', label: 'Bronzo', min: 0, color: '#cd7f32', icon: '🥉' },
  { id: 'argento', label: 'Argento', min: 100, color: '#c0c0c0', icon: '🥈' },
  { id: 'oro', label: 'Oro', min: 250, color: '#ffd700', icon: '🥇' },
  { id: 'platino', label: 'Platino', min: 500, color: '#e5e4e2', icon: '💎' },
  { id: 'diamante', label: 'Diamante', min: 1000, color: '#b9f2ff', icon: '👑' },
]

export function getLevel(score) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (score >= LEVELS[i].min) return LEVELS[i]
  }
  return LEVELS[0]
}

export function getNextLevel(score) {
  for (const lvl of LEVELS) {
    if (score < lvl.min) return lvl
  }
  return null // max level
}

// ── Badge / Achievement ──────────────────────────────────
export const BADGES = [
  // Milestone report
  { id: 'first_report', icon: '🎯', label: 'Prima Segnalazione', desc: 'Hai creato il tuo primo report', category: 'milestone', check: s => s.totalReports >= 1 },
  { id: 'reports_10', icon: '📋', label: 'Segnalatore', desc: '10 report creati', category: 'milestone', check: s => s.totalReports >= 10 },
  { id: 'reports_25', icon: '📊', label: 'Veterano', desc: '25 report creati', category: 'milestone', check: s => s.totalReports >= 25 },
  { id: 'reports_50', icon: '🏅', label: 'Esperto', desc: '50 report creati', category: 'milestone', check: s => s.totalReports >= 50 },
  { id: 'reports_100', icon: '🌟', label: 'Centurione', desc: '100 report creati', category: 'milestone', check: s => s.totalReports >= 100 },
  // Quick report
  { id: 'quick_5', icon: '⚡', label: 'Fulmine', desc: '5 quick report inviati', category: 'speed', check: s => s.quickReports >= 5 },
  { id: 'quick_20', icon: '🚀', label: 'Razzo', desc: '20 quick report inviati', category: 'speed', check: s => s.quickReports >= 20 },
  // Foto
  { id: 'photos_5', icon: '📸', label: 'Fotografo', desc: '5 report con foto', category: 'quality', check: s => s.reportsWithPhotos >= 5 },
  { id: 'photos_20', icon: '🎬', label: 'Regista', desc: '20 report con foto', category: 'quality', check: s => s.reportsWithPhotos >= 20 },
  // Severità
  { id: 'critical_3', icon: '🔴', label: 'Occhio di Falco', desc: '3 segnalazioni critiche', category: 'vigilance', check: s => s.criticalReports >= 3 },
  { id: 'critical_10', icon: '🛡️', label: 'Guardiano', desc: '10 segnalazioni critiche', category: 'vigilance', check: s => s.criticalReports >= 10 },
  // Streak
  { id: 'streak_3', icon: '🔥', label: 'Tre di Fila', desc: '3 giorni consecutivi', category: 'streak', check: s => s.streak >= 3 },
  { id: 'streak_7', icon: '💪', label: 'Settimana Perfetta', desc: '7 giorni consecutivi', category: 'streak', check: s => s.streak >= 7 },
  { id: 'streak_30', icon: '🏆', label: 'Inarrestabile', desc: '30 giorni consecutivi', category: 'streak', check: s => s.streak >= 30 },
  // Dettaglio
  { id: 'detailed_10', icon: '📝', label: 'Scrupoloso', desc: '10 report dettagliati', category: 'quality', check: s => s.detailedReports >= 10 },
]

export const BADGE_CATEGORIES = {
  milestone: { label: 'Traguardi', color: '#7c6aff' },
  speed: { label: 'Velocità', color: '#f59e0b' },
  quality: { label: 'Qualità', color: '#06b6d4' },
  vigilance: { label: 'Vigilanza', color: '#ef4444' },
  streak: { label: 'Costanza', color: '#22c55e' },
}

function computeBadgeStats(reports, streak) {
  return {
    totalReports: reports.length,
    quickReports: reports.filter(r => r.is_quick).length,
    reportsWithPhotos: reports.filter(r => Array.isArray(r.media) && r.media.length > 0).length,
    criticalReports: reports.filter(r => r.severity === 'critica').length,
    detailedReports: reports.filter(r => r.description && r.description.length > 50).length,
    streak,
  }
}

function computeStreak(reportDates) {
  if (reportDates.length === 0) return 0
  const uniqueDays = [...new Set(reportDates.map(d => {
    const dt = new Date(d)
    return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`
  }))].sort().reverse()

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`

  // Streak parte da oggi o ieri
  let streak = 0
  let checkDate = new Date(today)

  // Se non ci sono report oggi, controlla da ieri
  if (uniqueDays[0] !== todayKey) {
    checkDate.setDate(checkDate.getDate() - 1)
  }

  for (let i = 0; i < 365; i++) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`
    if (uniqueDays.includes(key)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

function computeOperatorScore(reports) {
  let score = 0
  const breakdown = { reports: 0, quick: 0, photos: 0, severity: 0, detailed: 0, streak: 0 }

  reports.forEach(r => {
    // Base: report creato
    score += SCORE_RULES.reportCreated
    breakdown.reports += SCORE_RULES.reportCreated

    // Bonus quick report
    if (r.is_quick) {
      score += SCORE_RULES.quickReportBonus
      breakdown.quick += SCORE_RULES.quickReportBonus
    }

    // Bonus foto
    const photoCount = Array.isArray(r.media) ? r.media.length : 0
    if (photoCount > 0) {
      const pts = photoCount * SCORE_RULES.photoBonus
      score += pts
      breakdown.photos += pts
    }

    // Bonus severità alta/critica
    if (r.severity === 'alta' || r.severity === 'critica') {
      score += SCORE_RULES.highSeverityBonus
      breakdown.severity += SCORE_RULES.highSeverityBonus
    }

    // Bonus descrizione dettagliata
    if (r.description && r.description.length > 50) {
      score += SCORE_RULES.detailedDescBonus
      breakdown.detailed += SCORE_RULES.detailedDescBonus
    }
  })

  // Streak
  const dates = reports.map(r => r.created_at).filter(Boolean)
  const streak = computeStreak(dates)
  const streakPts = streak * SCORE_RULES.streakBonusPerDay
  score += streakPts
  breakdown.streak = streakPts

  // Badge
  const badgeStats = computeBadgeStats(reports, streak)
  const badges = BADGES.filter(b => b.check(badgeStats))
  const badgeProgress = BADGES.map(b => ({ ...b, unlocked: b.check(badgeStats) }))

  return { score, breakdown, streak, reportCount: reports.length, badges, badgeProgress, badgeStats }
}

/**
 * Hook principale — calcola classifica di tutti gli operatori
 * @param {Array} allReports - tutti i report dell'organizzazione
 * @param {string} [period='all'] - 'week' | 'month' | 'all'
 */
export function useOperatorScore(allReports, period = 'all') {
  return useMemo(() => {
    if (!allReports || allReports.length === 0) {
      return { leaderboard: [], myScore: null }
    }

    const now = Date.now()
    const DAY = 86400000

    // Filtra per periodo
    let filtered = allReports
    if (period === 'week') {
      filtered = allReports.filter(r => new Date(r.created_at).getTime() > now - 7 * DAY)
    } else if (period === 'month') {
      filtered = allReports.filter(r => new Date(r.created_at).getTime() > now - 30 * DAY)
    }

    // Raggruppa per operatore
    const byOperator = {}
    filtered.forEach(r => {
      const key = r.created_by || 'unknown'
      if (!byOperator[key]) {
        byOperator[key] = { id: key, name: r.created_by_name || 'Sconosciuto', reports: [] }
      }
      byOperator[key].reports.push(r)
    })

    // Calcola punteggi
    const leaderboard = Object.values(byOperator).map(op => {
      const { score, breakdown, streak, reportCount, badges, badgeProgress, badgeStats } = computeOperatorScore(op.reports)
      const level = getLevel(score)
      const nextLevel = getNextLevel(score)
      const progress = nextLevel ? Math.round(((score - level.min) / (nextLevel.min - level.min)) * 100) : 100
      return {
        id: op.id,
        name: op.name,
        score,
        breakdown,
        streak,
        reportCount,
        level,
        nextLevel,
        progress,
        badges,
        badgeProgress,
        badgeStats,
        reportsThisWeek: op.reports.filter(r => new Date(r.created_at).getTime() > now - 7 * DAY).length,
        reportsThisMonth: op.reports.filter(r => new Date(r.created_at).getTime() > now - 30 * DAY).length,
      }
    }).sort((a, b) => b.score - a.score)

    // Assegna posizioni
    leaderboard.forEach((op, i) => { op.rank = i + 1 })

    return { leaderboard }
  }, [allReports, period])
}

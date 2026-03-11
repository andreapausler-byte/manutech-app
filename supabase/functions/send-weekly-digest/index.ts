/**
 * Edge Function: send-weekly-digest
 *
 * Invia un riepilogo settimanale per email, personalizzato per ruolo.
 * Schedulata via pg_cron ogni lunedì alle 8:00 CET.
 *
 * Secrets necessari:
 *   RESEND_API_KEY — chiave API Resend
 *   EMAIL_FROM     — indirizzo mittente
 *   APP_URL        — URL frontend
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Helpers ──

function formatDuration(hours: number): string {
  if (hours === 0) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  const remaining = Math.round(hours % 24)
  return remaining > 0 ? `${days}g ${remaining}h` : `${days}g`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Data fetching per org ──

interface OrgDigestData {
  reports: Array<Record<string, unknown>>
  maintenancePlans: Array<Record<string, unknown>>
  maintenanceLogs: Array<Record<string, unknown>>
  machines: Array<Record<string, unknown>>
}

async function fetchOrgData(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<OrgDigestData> {
  const [reportsRes, plansRes, logsRes, machinesRes] = await Promise.all([
    supabase.from('reports').select('*').eq('org_id', orgId),
    supabase.from('maintenance_plans').select('*').eq('org_id', orgId),
    supabase.from('maintenance_logs').select('*').eq('org_id', orgId),
    supabase.from('machines').select('id, name').eq('org_id', orgId),
  ])

  return {
    reports: reportsRes.data || [],
    maintenancePlans: plansRes.data || [],
    maintenanceLogs: logsRes.data || [],
    machines: machinesRes.data || [],
  }
}

// ── Calcolo KPI (logica server-side, ispirata a useKPIStats.js) ──

interface KPIStats {
  totalReports: number
  openReports: number
  resolvedThisWeek: number
  reportsThisWeek: number
  reportsLastWeek: number
  weeklyChange: number
  resolutionRate: number
  avgResolutionLabel: string
  criticalOpen: number
  highOpen: number
  topMachines: Array<{ name: string; count: number }>
  maintenanceOverdue: number
  maintenanceWarning: number
  maintenanceOk: number
  technicianWorkload: Array<{ name: string; open: number; inProgress: number }>
}

function computeKPI(data: OrgDigestData): KPIStats {
  const { reports, maintenancePlans, maintenanceLogs, machines } = data
  const now = Date.now()
  const WEEK = 7 * 86400000

  const thisWeekStart = now - WEEK
  const lastWeekStart = now - 2 * WEEK

  // Report stats
  const openReports = reports.filter(r => r.status !== 'risolta').length
  const reportsThisWeek = reports.filter(r => new Date(r.created_at as string).getTime() > thisWeekStart).length
  const reportsLastWeek = reports.filter(r => {
    const t = new Date(r.created_at as string).getTime()
    return t > lastWeekStart && t <= thisWeekStart
  }).length
  const resolvedThisWeek = reports.filter(r =>
    r.status === 'risolta' && r.updated_at && new Date(r.updated_at as string).getTime() > thisWeekStart
  ).length
  const weeklyChange = reportsLastWeek > 0
    ? Math.round(((reportsThisWeek - reportsLastWeek) / reportsLastWeek) * 100)
    : reportsThisWeek > 0 ? 100 : 0

  // Resolution
  const resolved = reports.filter(r => r.status === 'risolta' && r.created_at && r.updated_at)
  const resTimes = resolved.map(r => {
    return (new Date(r.updated_at as string).getTime() - new Date(r.created_at as string).getTime()) / 3600000
  }).filter(h => h > 0 && h < 8760)
  const avgHours = resTimes.length > 0 ? resTimes.reduce((a, b) => a + b, 0) / resTimes.length : 0
  const resolutionRate = reports.length > 0 ? Math.round((resolved.length / reports.length) * 100) : 0

  // Critical/high open
  const criticalOpen = reports.filter(r => r.status !== 'risolta' && r.severity === 'critica').length
  const highOpen = reports.filter(r => r.status !== 'risolta' && r.severity === 'alta').length

  // Top machines
  const machineMap: Record<string, number> = {}
  reports.filter(r => r.machine && r.status !== 'risolta').forEach(r => {
    machineMap[r.machine as string] = (machineMap[r.machine as string] || 0) + 1
  })
  const topMachines = Object.entries(machineMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  // Maintenance status (traffic light)
  let maintenanceOverdue = 0
  let maintenanceWarning = 0
  let maintenanceOk = 0

  for (const plan of maintenancePlans) {
    const planLogs = maintenanceLogs.filter(l => l.plan_id === plan.id)
    const lastLog = planLogs.sort((a, b) =>
      new Date(b.performed_at as string).getTime() - new Date(a.performed_at as string).getTime()
    )[0]

    const lastDate = lastLog ? new Date(lastLog.performed_at as string).getTime() : new Date(plan.created_at as string).getTime()
    const freqMs = (plan.frequency_days as number) * 86400000
    const daysLeft = Math.ceil((lastDate + freqMs - now) / 86400000)

    if (daysLeft <= 0) maintenanceOverdue++
    else if (daysLeft <= 7) maintenanceWarning++
    else maintenanceOk++
  }

  // Technician workload
  const techMap: Record<string, { name: string; open: number; inProgress: number }> = {}
  reports.filter(r => r.status !== 'risolta' && r.assigned_to_name).forEach(r => {
    const name = r.assigned_to_name as string
    if (!techMap[name]) techMap[name] = { name, open: 0, inProgress: 0 }
    if (r.status === 'in_lavorazione') techMap[name].inProgress++
    else techMap[name].open++
  })
  const technicianWorkload = Object.values(techMap).sort((a, b) => (b.open + b.inProgress) - (a.open + a.inProgress))

  return {
    totalReports: reports.length,
    openReports,
    resolvedThisWeek,
    reportsThisWeek,
    reportsLastWeek,
    weeklyChange,
    resolutionRate,
    avgResolutionLabel: formatDuration(avgHours),
    criticalOpen,
    highOpen,
    topMachines,
    maintenanceOverdue,
    maintenanceWarning,
    maintenanceOk,
    technicianWorkload,
  }
}

// ── Dati per tecnico ──

interface TechDigest {
  assignedOpen: number
  inProgress: number
  resolvedThisWeek: number
  overdueMaintenancePlans: Array<{ name: string; machineName: string }>
}

function computeTechDigest(
  data: OrgDigestData,
  userId: string
): TechDigest {
  const { reports, maintenancePlans, maintenanceLogs, machines } = data
  const now = Date.now()
  const WEEK = 7 * 86400000

  const myReports = reports.filter(r => r.assigned_to === userId)
  const assignedOpen = myReports.filter(r => r.status === 'assegnata').length
  const inProgress = myReports.filter(r => r.status === 'in_lavorazione').length
  const resolvedThisWeek = myReports.filter(r =>
    r.status === 'risolta' && r.updated_at && new Date(r.updated_at as string).getTime() > now - WEEK
  ).length

  // Maintenance assigned to me, overdue
  const machineNames: Record<string, string> = {}
  machines.forEach(m => { machineNames[m.id as string] = m.name as string })

  const overdueMaintenancePlans: Array<{ name: string; machineName: string }> = []
  for (const plan of maintenancePlans) {
    if (plan.assigned_to !== userId) continue
    const planLogs = maintenanceLogs.filter(l => l.plan_id === plan.id)
    const lastLog = planLogs.sort((a, b) =>
      new Date(b.performed_at as string).getTime() - new Date(a.performed_at as string).getTime()
    )[0]
    const lastDate = lastLog ? new Date(lastLog.performed_at as string).getTime() : new Date(plan.created_at as string).getTime()
    const daysLeft = Math.ceil((lastDate + (plan.frequency_days as number) * 86400000 - now) / 86400000)
    if (daysLeft <= 7) {
      overdueMaintenancePlans.push({
        name: plan.name as string,
        machineName: machineNames[plan.machine_id as string] || '—',
      })
    }
  }

  return { assignedOpen, inProgress, resolvedThisWeek, overdueMaintenancePlans }
}

// ── Dati per operatore ──

interface OperatorDigest {
  myReportsOpen: number
  myReportsResolved: number
  myReportsTotal: number
}

function computeOperatorDigest(data: OrgDigestData, userId: string): OperatorDigest {
  const myReports = data.reports.filter(r => r.created_by === userId)
  return {
    myReportsOpen: myReports.filter(r => r.status !== 'risolta').length,
    myReportsResolved: myReports.filter(r => r.status === 'risolta').length,
    myReportsTotal: myReports.length,
  }
}

// ── Template HTML digest ──

function buildAdminDigestHtml(kpi: KPIStats, appUrl: string): string {
  const trendIcon = kpi.weeklyChange > 0 ? '&#9650;' : kpi.weeklyChange < 0 ? '&#9660;' : '&#9644;'
  const trendColor = kpi.weeklyChange > 0 ? '#ef4444' : kpi.weeklyChange < 0 ? '#22c55e' : '#6b7280'

  const topMachinesHtml = kpi.topMachines.length > 0
    ? kpi.topMachines.map(m => `<li style="padding:4px 0;font-size:14px;color:#4a4a68">${escapeHtml(m.name)} — <strong>${m.count}</strong> segnalazioni attive</li>`).join('')
    : '<li style="padding:4px 0;font-size:14px;color:#22c55e">Nessuna macchina con segnalazioni attive</li>'

  const workloadHtml = kpi.technicianWorkload.length > 0
    ? kpi.technicianWorkload.map(t =>
      `<li style="padding:4px 0;font-size:14px;color:#4a4a68">${escapeHtml(t.name)} — ${t.open + t.inProgress} assegnate (${t.inProgress} in corso)</li>`
    ).join('')
    : '<li style="padding:4px 0;font-size:14px;color:#6b7280">Nessun tecnico con segnalazioni assegnate</li>'

  return wrapEmailTemplate('Riepilogo Settimanale', `
    <!-- KPI Grid -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        ${kpiCell('Segnalazioni', kpi.reportsThisWeek.toString(), `<span style="color:${trendColor};font-size:11px">${trendIcon} ${Math.abs(kpi.weeklyChange)}% vs scorsa</span>`)}
        ${kpiCell('Risolte', kpi.resolvedThisWeek.toString(), `<span style="color:#6b7280;font-size:11px">questa settimana</span>`)}
        ${kpiCell('Tasso risoluzione', `${kpi.resolutionRate}%`, `<span style="color:#6b7280;font-size:11px">su ${kpi.totalReports} totali</span>`)}
        ${kpiCell('Tempo medio', kpi.avgResolutionLabel, `<span style="color:#6b7280;font-size:11px">risoluzione</span>`)}
      </tr>
    </table>

    <!-- Urgenze -->
    ${(kpi.criticalOpen > 0 || kpi.highOpen > 0) ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <strong style="color:#dc2626;font-size:13px">Segnalazioni urgenti aperte:</strong>
      <span style="color:#4a4a68;font-size:13px">${kpi.criticalOpen} critiche, ${kpi.highOpen} alte</span>
    </div>` : ''}

    <!-- Manutenzione -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <strong style="font-size:14px;color:#1a1a2e;display:block;margin-bottom:8px">Stato manutenzione</strong>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:16px"><span style="color:#ef4444;font-weight:700;font-size:16px">${kpi.maintenanceOverdue}</span> <span style="color:#6b7280;font-size:12px">scadute</span></td>
          <td style="padding-right:16px"><span style="color:#f59e0b;font-weight:700;font-size:16px">${kpi.maintenanceWarning}</span> <span style="color:#6b7280;font-size:12px">in scadenza</span></td>
          <td><span style="color:#22c55e;font-weight:700;font-size:16px">${kpi.maintenanceOk}</span> <span style="color:#6b7280;font-size:12px">in regola</span></td>
        </tr>
      </table>
    </div>

    <!-- Top macchine -->
    <div style="margin-bottom:16px">
      <strong style="font-size:14px;color:#1a1a2e;display:block;margin-bottom:6px">Macchine pi&ugrave; problematiche</strong>
      <ul style="margin:0;padding-left:18px">${topMachinesHtml}</ul>
    </div>

    <!-- Carico tecnici -->
    <div style="margin-bottom:16px">
      <strong style="font-size:14px;color:#1a1a2e;display:block;margin-bottom:6px">Carico lavoro tecnici</strong>
      <ul style="margin:0;padding-left:18px">${workloadHtml}</ul>
    </div>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:#6366f1;border-radius:10px;padding:12px 24px">
        <a href="${appUrl}/admin" style="color:#fff;text-decoration:none;font-size:14px;font-weight:600">Apri Dashboard &rarr;</a>
      </td></tr>
    </table>
  `, appUrl)
}

function buildTechDigestHtml(digest: TechDigest, userName: string, appUrl: string): string {
  const overdueHtml = digest.overdueMaintenancePlans.length > 0
    ? digest.overdueMaintenancePlans.map(p =>
      `<li style="padding:4px 0;font-size:14px;color:#4a4a68">${escapeHtml(p.name)} — ${escapeHtml(p.machineName)}</li>`
    ).join('')
    : '<li style="padding:4px 0;font-size:14px;color:#22c55e">Tutto in regola!</li>'

  return wrapEmailTemplate(`Ciao ${escapeHtml(userName)}`, `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        ${kpiCell('Assegnate', digest.assignedOpen.toString(), '<span style="color:#6b7280;font-size:11px">da iniziare</span>')}
        ${kpiCell('In corso', digest.inProgress.toString(), '<span style="color:#6b7280;font-size:11px">in lavorazione</span>')}
        ${kpiCell('Risolte', digest.resolvedThisWeek.toString(), '<span style="color:#6b7280;font-size:11px">questa settimana</span>')}
      </tr>
    </table>

    <div style="margin-bottom:16px">
      <strong style="font-size:14px;color:#1a1a2e;display:block;margin-bottom:6px">Manutenzioni in scadenza</strong>
      <ul style="margin:0;padding-left:18px">${overdueHtml}</ul>
    </div>

    <table cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:#6366f1;border-radius:10px;padding:12px 24px">
        <a href="${appUrl}" style="color:#fff;text-decoration:none;font-size:14px;font-weight:600">Apri ManuTech &rarr;</a>
      </td></tr>
    </table>
  `, appUrl)
}

function buildOperatorDigestHtml(digest: OperatorDigest, userName: string, appUrl: string): string {
  return wrapEmailTemplate(`Ciao ${escapeHtml(userName)}`, `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        ${kpiCell('Le tue segnalazioni', digest.myReportsTotal.toString(), '')}
        ${kpiCell('Ancora aperte', digest.myReportsOpen.toString(), '')}
        ${kpiCell('Risolte', digest.myReportsResolved.toString(), '')}
      </tr>
    </table>

    <table cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:#6366f1;border-radius:10px;padding:12px 24px">
        <a href="${appUrl}" style="color:#fff;text-decoration:none;font-size:14px;font-weight:600">Apri ManuTech &rarr;</a>
      </td></tr>
    </table>
  `, appUrl)
}

// ── Shared email structure ──

function kpiCell(label: string, value: string, subtitle: string): string {
  return `<td style="padding:8px;text-align:center;background:#f8fafc;border-radius:8px">
    <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">${label}</div>
    <div style="font-size:24px;font-weight:800;color:#1a1a2e;margin:4px 0">${value}</div>
    ${subtitle}
  </td>`
}

function wrapEmailTemplate(heading: string, content: string, appUrl: string): string {
  const dateStr = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:24px 28px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#fff;font-size:20px;font-weight:700">ManuTech</td>
              <td align="right" style="color:rgba(255,255,255,0.75);font-size:12px">${dateStr}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:28px">
          <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#1a1a2e">${heading}</h2>
          ${content}
        </td></tr>
        <tr><td style="padding:16px 28px 20px;border-top:1px solid #eef0f4">
          <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5">
            Riepilogo settimanale ManuTech. Puoi disattivarlo dall'app &rarr; Impostazioni &rarr; Notifiche Email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'ManuTech <onboarding@resend.dev>'
    const appUrl = (Deno.env.get('APP_URL') || 'https://app.manutech.it').replace(/\/$/, '')

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Ottieni tutte le organizzazioni attive
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, name, email, role, org_id')

    if (!allUsers || allUsers.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No users found' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Raggruppa per org
    const orgUsers: Record<string, typeof allUsers> = {}
    allUsers.forEach(u => {
      if (!orgUsers[u.org_id]) orgUsers[u.org_id] = []
      orgUsers[u.org_id].push(u)
    })

    // Carica preferenze per tutti gli utenti
    const { data: prefsData } = await supabase
      .from('notification_preferences')
      .select('user_id, prefs, role, is_org_default, org_id')

    const userPrefs: Record<string, Record<string, boolean>> = {}
    const orgDefaults: Record<string, Record<string, Record<string, boolean>>> = {}

    prefsData?.forEach(p => {
      if (p.is_org_default && p.role) {
        if (!orgDefaults[p.org_id]) orgDefaults[p.org_id] = {}
        orgDefaults[p.org_id][p.role] = p.prefs as Record<string, boolean>
      } else if (p.user_id) {
        userPrefs[p.user_id] = p.prefs as Record<string, boolean>
      }
    })

    // Default digest: true per admin, false per altri
    function wantsDigest(userId: string, role: string, orgId: string): boolean {
      // Preferenza personale
      if (userPrefs[userId] && 'email_weekly_digest' in userPrefs[userId]) {
        return userPrefs[userId].email_weekly_digest !== false
      }
      // Org default
      if (orgDefaults[orgId]?.[role] && 'email_weekly_digest' in orgDefaults[orgId][role]) {
        return orgDefaults[orgId][role].email_weekly_digest !== false
      }
      // System default
      return role === 'admin'
    }

    let totalSent = 0
    let totalFailed = 0

    // Per ogni org, calcola KPI e invia digest
    for (const [orgId, users] of Object.entries(orgUsers)) {
      const eligible = users.filter(u => wantsDigest(u.id, u.role, orgId))
      if (eligible.length === 0) continue

      const data = await fetchOrgData(supabase, orgId)
      const kpi = computeKPI(data)

      for (const user of eligible) {
        let html: string

        if (user.role === 'admin') {
          html = buildAdminDigestHtml(kpi, appUrl)
        } else if (user.role === 'tecnico') {
          const techData = computeTechDigest(data, user.id)
          html = buildTechDigestHtml(techData, user.name, appUrl)
        } else {
          const opData = computeOperatorDigest(data, user.id)
          html = buildOperatorDigestHtml(opData, user.name, appUrl)
        }

        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: emailFrom,
              to: user.email,
              subject: `ManuTech — Riepilogo settimanale`,
              html,
            }),
          })

          if (res.ok) {
            totalSent++
            console.log(`[Digest] Sent to ${user.email} (${user.role})`)
          } else {
            totalFailed++
            const err = await res.json()
            console.error(`[Digest] Failed for ${user.email}:`, err)
          }
        } catch (err) {
          totalFailed++
          console.error(`[Digest] Error for ${user.email}:`, err)
        }
      }
    }

    console.log(`[Digest] Complete: sent=${totalSent}, failed=${totalFailed}`)

    return new Response(
      JSON.stringify({ sent: totalSent, failed: totalFailed }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[Digest] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Edge Function signup-org — Provisioning atomico
 *
 * Sequenza 4-step con rollback chirurgico. Vedi ADR completo
 * nell'header di ../index.ts (sezione "ARCHITECTURAL DECISION").
 *
 * Step A: INSERT organizations (plan='trial', trial_ends_at=now+30d,
 *         owner_user_id=NULL temporaneo)
 * Step B: auth.admin.createUser con _signup_via_edge=true
 *         (trigger handle_new_user vede il flag e returna senza INSERT)
 * Step C: INSERT users (auth_id, role='admin', org_id=new_org)
 *         (trigger validate_org_id_format verifica esistenza — OK,
 *          stessa transazione)
 * Step D: UPDATE organizations.owner_user_id (Q3: fail = warning, no rollback)
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SignupRequest, WarningCode } from './types.ts'
import { sendNewSignupNotification } from './email.ts'

const TRIAL_DAYS = 30

export type ProvisionResult =
  | {
      ok: true
      org_id: string
      user_id: string
      warnings: WarningCode[]
    }
  | {
      ok: false
      error: 'email_exists' | 'slug_taken' | 'internal'
      message: string
    }

export async function provisionOrganization(
  supabase: SupabaseClient,
  input: SignupRequest,
): Promise<ProvisionResult> {
  const warnings: WarningCode[] = []
  let orgId: string | null = null
  let userId: string | null = null

  // ── Step A: INSERT organizations ────────────────────────────
  // approval_status='pending' (default mig. 035): le nuove org entrano
  // in coda moderazione. Un super_admin le approva via console.
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: orgData, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: input.org_name,
      slug: input.org_slug,
      plan: 'trial',
      status: 'trial',
      approval_status: 'pending',
      trial_ends_at: trialEndsAt,
      owner_user_id: null,  // settato in Step D
    })
    .select('id')
    .single()

  if (orgErr || !orgData) {
    // Race condition slug: tra check_slug_available (RPC, step 6 di index.ts)
    // e questo INSERT, un altro signup concorrente può aver registrato lo
    // stesso slug. Postgres unique_violation = SQLSTATE 23505. Trasformiamo
    // l'errore generico 'internal' in 'slug_taken' user-friendly + retryable.
    const errCode = (orgErr as { code?: string })?.code
    const errMsg = orgErr?.message?.toLowerCase() ?? ''
    if (errCode === '23505' || errMsg.includes('duplicate key')) {
      console.warn('[signup-org] Step A slug race detected:', input.org_slug)
      return {
        ok: false,
        error: 'slug_taken',
        message: `Slug "${input.org_slug}" appena registrato da un altro utente, riprova`,
      }
    }
    console.error('[signup-org] Step A failed:', orgErr?.message)
    return {
      ok: false,
      error: 'internal',
      message: `Errore creazione organizzazione: ${orgErr?.message || 'unknown'}`,
    }
  }
  orgId = orgData.id

  // ── Step B: auth.admin.createUser con escape-hatch ──────────
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email: input.admin_email,
    password: input.admin_password,
    email_confirm: true,  // Q2 confermato: skip verification, login immediato
    user_metadata: {
      name: input.admin_full_name,
      role: 'admin',
      _signup_via_edge: 'true',  // ← trigger handle_new_user farà early-return
    },
  })

  if (userErr || !userData?.user) {
    // Rollback Step A
    await rollbackOrganization(supabase, orgId)

    // Distingui email_exists da altri errori per dare messaggio specifico.
    // Strategia in cascata (più stabile → meno stabile):
    //   1. error.code esposto dalla SDK (es. 'email_exists', 'user_already_exists')
    //   2. status HTTP 422 + keyword nel message (Supabase usa 422 per email dup)
    //   3. fallback string-match su varianti note (legacy, robustezza)
    const authStatus = (userErr as { status?: number })?.status
    const authCode = (userErr as { code?: string })?.code
    const msg = (userErr?.message || '').toLowerCase()
    const isEmailDup =
      authCode === 'email_exists' ||
      authCode === 'user_already_exists' ||
      authCode === 'email_address_already_exists' ||
      (authStatus === 422 && (msg.includes('already') || msg.includes('exists'))) ||
      msg.includes('already registered') ||
      msg.includes('already exists') ||
      msg.includes('user already')

    if (isEmailDup) {
      return {
        ok: false,
        error: 'email_exists',
        message: `Email "${input.admin_email}" già registrata`,
      }
    }
    console.error('[signup-org] Step B failed:', msg, { code: authCode, status: authStatus })
    return {
      ok: false,
      error: 'internal',
      message: `Errore creazione utente: ${userErr?.message || 'unknown'}`,
    }
  }
  userId = userData.user.id

  // ── Step C: INSERT users (profilo applicativo) ──────────────
  const { error: profileErr } = await supabase
    .from('users')
    .insert({
      auth_id: userId,
      email: input.admin_email,
      name: input.admin_full_name,
      role: 'admin',
      org_id: orgId,
      status: 'active',
    })

  if (profileErr) {
    // Rollback Step B + Step A
    console.error('[signup-org] Step C failed:', profileErr.message,
      { org_id: orgId, user_id: userId })
    await rollbackUser(supabase, userId)
    await rollbackOrganization(supabase, orgId)
    return {
      ok: false,
      error: 'internal',
      message: `Errore creazione profilo: ${profileErr.message}`,
    }
  }

  // ── Step D: UPDATE owner_user_id (Q3: fail = warning, no rollback) ──
  const { error: ownerErr } = await supabase
    .from('organizations')
    .update({ owner_user_id: userId })
    .eq('id', orgId)

  if (ownerErr) {
    console.warn('[signup-org] Step D failed (non-blocking):', ownerErr.message,
      { org_id: orgId, user_id: userId })
    warnings.push('owner_user_id_update_failed')
  }

  // ── Step E: notifica email super_admin (non bloccante) ──
  // Il signup è già committato; se l'email fallisce, l'org è comunque
  // visibile nella coda /super-admin/pending-orgs. Warning loggato.
  const emailRes = await sendNewSignupNotification({
    orgId,
    orgName: input.org_name,
    orgSlug: input.org_slug,
    ownerEmail: input.admin_email,
    ownerName: input.admin_full_name,
  })
  if (!emailRes.ok) {
    warnings.push('notification_email_failed')
  }

  return {
    ok: true,
    org_id: orgId,
    user_id: userId,
    warnings,
  }
}

// ── Rollback helpers (best effort, log fallimenti) ────────────
async function rollbackOrganization(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from('organizations')
    .delete()
    .eq('id', orgId)
  if (error) {
    console.error('[signup-org] ROLLBACK failed (orphan org):', error.message,
      { org_id: orgId })
  }
}

async function rollbackUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) {
    console.error('[signup-org] ROLLBACK failed (orphan auth user):', error.message,
      { user_id: userId })
  }
}

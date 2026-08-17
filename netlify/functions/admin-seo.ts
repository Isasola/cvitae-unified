/**
 * Admin SEO Control Center — data function.
 * GET /api/admin-seo — returns SEO status overview + per-item details
 * POST /api/admin-seo — run pipeline on one or all pending opportunities
 */

import type { Handler } from '@netlify/functions'
import { makeSupabaseAdmin } from './_supabase'
import { runSeoPipeline } from './lib/seo-pipeline-runner'
import { serverSeoFlags } from '../../src/lib/seo/flags'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

function checkAuth(event: Parameters<Handler>[0]): boolean {
  const auth = event.headers['x-admin-password'] || event.headers['authorization']?.replace('Bearer ', '')
  return auth === ADMIN_PASSWORD
}

const handler: Handler = async (event) => {
  if (!checkAuth(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const supabase = makeSupabaseAdmin()
  const flags = serverSeoFlags()

  // ─── GET: SEO overview + per-item details ─────────────────────────────────
  if (event.httpMethod === 'GET') {
    const params = new URLSearchParams(event.rawQuery || '')
    const filter = params.get('filter') || 'all'  // all | eligible | review | blocked | unchecked
    const limit = Math.min(Number(params.get('limit') || '100'), 500)

    // Summary counts
    const [eligible, review, blocked, unchecked] = await Promise.all([
      supabase.from('opportunities').select('id', { count: 'exact', head: true })
        .eq('seo_status', 'eligible').eq('is_active', true).is('deleted_at', null),
      supabase.from('opportunities').select('id', { count: 'exact', head: true })
        .eq('seo_status', 'review').is('deleted_at', null),
      supabase.from('opportunities').select('id', { count: 'exact', head: true })
        .eq('seo_status', 'blocked').is('deleted_at', null),
      supabase.from('opportunities').select('id', { count: 'exact', head: true })
        .is('seo_status', null).eq('verification_status', 'verified').eq('is_active', true).is('deleted_at', null),
    ])

    const summary = {
      eligible: eligible.count ?? 0,
      review: review.count ?? 0,
      blocked: blocked.count ?? 0,
      unchecked: unchecked.count ?? 0,
      flags,
    }

    // Per-item details
    let query = supabase
      .from('opportunities')
      .select('id,slug,title,organization,source,opportunity_type,type,seo_status,jobposting_validity,seo_issues,seo_missing_fields,seo_checked_at,verification_status,is_active,deleted_at')
      .order('seo_checked_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (filter === 'eligible') query = query.eq('seo_status', 'eligible')
    else if (filter === 'review') query = query.eq('seo_status', 'review')
    else if (filter === 'blocked') query = query.eq('seo_status', 'blocked')
    else if (filter === 'unchecked') query = query.is('seo_status', null).eq('verification_status', 'verified').eq('is_active', true)

    const { data: items, error } = await query
    if (error) {
      console.error('[admin-seo] fetch error', error)
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    }

    return { statusCode: 200, body: JSON.stringify({ summary, items: items || [] }) }
  }

  // ─── POST: run pipeline ────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body: Record<string, any> = {}
    try { body = JSON.parse(event.body || '{}') } catch { /* empty body ok */ }

    const action = body.action as string

    // Run pipeline on a single opportunity
    if (action === 'run_pipeline' && body.opportunityId) {
      const dryRun = flags.SEO_DRY_RUN
      const result = await runSeoPipeline(supabase, body.opportunityId, dryRun)
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    // Bulk: run pipeline on all unchecked verified opportunities
    if (action === 'run_bulk_pipeline') {
      if (!flags.SEO_PIPELINE_V2) {
        return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'SEO_PIPELINE_V2 flag is off' }) }
      }
      const { data: pending } = await supabase
        .from('opportunities')
        .select('id')
        .is('seo_status', null)
        .eq('verification_status', 'verified')
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(200)

      if (!pending || pending.length === 0) {
        return { statusCode: 200, body: JSON.stringify({ processed: 0, message: 'Nothing to process' }) }
      }

      const dryRun = flags.SEO_DRY_RUN
      const results = await Promise.allSettled(
        pending.map(row => runSeoPipeline(supabase, row.id, dryRun))
      )
      const ok = results.filter(r => r.status === 'fulfilled' && (r.value as any).ok).length
      const failed = results.length - ok
      return { statusCode: 200, body: JSON.stringify({ processed: results.length, ok, failed, dryRun }) }
    }

    // Source Quality metrics (component I)
    if (action === 'source_quality') {
      const { data: rows } = await supabase
        .from('opportunities')
        .select('source,is_active,verification_status,seo_eligible,seo_status,jobposting_validity,title,description,organization,application_url,deleted_at')
        .is('deleted_at', null)
        .limit(5000)

      if (!rows) return { statusCode: 200, body: JSON.stringify({ sources: [] }) }

      const bySource: Record<string, {
        total: number; verified: number; active: number; seoEligible: number;
        seoEligiblePct: number; jobPostingValid: number; jobPostingInvalid: number;
        missingTitle: number; missingDesc: number; missingOrg: number; missingUrl: number;
      }> = {}

      for (const row of rows) {
        const src = row.source || 'unknown'
        if (!bySource[src]) {
          bySource[src] = { total: 0, verified: 0, active: 0, seoEligible: 0,
            seoEligiblePct: 0, jobPostingValid: 0, jobPostingInvalid: 0,
            missingTitle: 0, missingDesc: 0, missingOrg: 0, missingUrl: 0 }
        }
        const s = bySource[src]
        s.total++
        if (row.verification_status === 'verified') s.verified++
        if (row.is_active) s.active++
        if (row.seo_eligible) s.seoEligible++
        if (row.jobposting_validity === 'valid') s.jobPostingValid++
        if (row.jobposting_validity === 'incomplete') s.jobPostingInvalid++
        if (!row.title || !String(row.title).trim()) s.missingTitle++
        if (!row.description || !String(row.description).trim()) s.missingDesc++
        if (!row.organization || !String(row.organization).trim()) s.missingOrg++
        if (!row.application_url) s.missingUrl++
      }

      const sources = Object.entries(bySource).map(([source, stats]) => ({
        source,
        ...stats,
        seoEligiblePct: stats.total > 0 ? Math.round(stats.seoEligible * 100 / stats.total) : 0,
        verifiedPct: stats.total > 0 ? Math.round(stats.verified * 100 / stats.total) : 0,
      })).sort((a, b) => b.total - a.total)

      return { statusCode: 200, body: JSON.stringify({ sources }) }
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
}

export { handler }

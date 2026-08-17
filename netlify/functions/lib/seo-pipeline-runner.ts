/**
 * Shared SEO pipeline logic.
 * Called directly from admin-data.ts after approval, and also exposed as
 * a standalone HTTP function at /api/seo-pipeline.
 *
 * Never throws — pipeline errors are logged but never bubble up to callers.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeOpportunity, type RawOpportunity } from '../../../src/lib/seo/normalize'
import { validateEligibility } from '../../../src/lib/seo/eligibility'

const FETCH_SELECT = [
  'id', 'slug', 'title', 'description', 'organization', 'location', 'country_code',
  'city', 'type', 'opportunity_type', 'application_url', 'deadline',
  'source', 'is_active', 'verification_status', 'catalog_eligible',
  'seo_eligible', 'deleted_at', 'archived_at', 'created_at', 'updated_at',
].join(',')

export interface PipelineResult {
  ok: boolean
  dryRun: boolean
  opportunityId: string
  seoStatus?: string
  jobpostingValidity?: string
  missingFields?: string[]
  issueCount?: number
  error?: string
}

export async function runSeoPipeline(
  supabase: SupabaseClient,
  opportunityId: string,
  dryRun = true,
): Promise<PipelineResult> {
  try {
    const { data: raw, error: fetchError } = await supabase
      .from('opportunities')
      .select(FETCH_SELECT)
      .eq('id', opportunityId)
      .maybeSingle()

    if (fetchError || !raw) {
      console.error('[seo-pipeline] fetch error', opportunityId, fetchError?.message)
      return { ok: false, dryRun, opportunityId, error: fetchError?.message || 'Not found' }
    }

    const normalized = normalizeOpportunity(raw as RawOpportunity)
    const eligibility = validateEligibility(normalized)

    const patch = {
      seo_status: eligibility.seoStatus,
      jobposting_validity: eligibility.jobpostingValidity,
      seo_issues: eligibility.issues,
      seo_missing_fields: eligibility.missingFields,
      seo_checked_at: new Date().toISOString(),
    }

    if (dryRun) {
      console.log('[seo-pipeline] DRY RUN', { id: opportunityId, seo_status: patch.seo_status, jobposting_validity: patch.jobposting_validity })
      return {
        ok: true,
        dryRun: true,
        opportunityId,
        seoStatus: eligibility.seoStatus,
        jobpostingValidity: eligibility.jobpostingValidity,
        missingFields: eligibility.missingFields,
        issueCount: eligibility.issues.length,
      }
    }

    const { error: updateError } = await supabase
      .from('opportunities')
      .update(patch)
      .eq('id', opportunityId)

    if (updateError) {
      console.error('[seo-pipeline] update error', opportunityId, updateError.message)
      return { ok: false, dryRun: false, opportunityId, error: updateError.message }
    }

    console.log('[seo-pipeline] ok', opportunityId, eligibility.seoStatus, eligibility.jobpostingValidity)
    return {
      ok: true,
      dryRun: false,
      opportunityId,
      seoStatus: eligibility.seoStatus,
      jobpostingValidity: eligibility.jobpostingValidity,
      missingFields: eligibility.missingFields,
      issueCount: eligibility.issues.length,
    }
  } catch (err: any) {
    // Pipeline must never break callers
    console.error('[seo-pipeline] unexpected error', opportunityId, err?.message)
    return { ok: false, dryRun, opportunityId, error: err?.message || 'Unexpected error' }
  }
}

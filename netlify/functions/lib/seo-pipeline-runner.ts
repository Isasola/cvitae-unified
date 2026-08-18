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
import { classifyOpportunity } from '../../../src/lib/seo/classify'
import { enqueueIndexingEvent } from './indexing-queue'

const FETCH_SELECT = [
  'id', 'slug', 'title', 'description', 'organization', 'location', 'country_code',
  'city', 'type', 'opportunity_type', 'opportunity_kind', 'application_url', 'deadline',
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
  publicationDecision?: 'AUTO_APPROVE' | 'REVIEW' | 'BLOCK'
  classificationReasons?: Array<{ code: string; message: string; evidence?: string; severity: string }>
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

    // Quality gate — classify is authoritative for BLOCK/REVIEW decisions.
    // BLOCK overrides any eligibility result; REVIEW downgrades eligible → review.
    // classify never promotes: if eligibility says review, classify can't make it eligible.
    const classification = classifyOpportunity({
      id: raw.id,
      slug: (raw as any).slug,
      title: (raw as any).title,
      description: (raw as any).description,
      organization: (raw as any).organization,
      location: (raw as any).location,
      city: (raw as any).city,
      type: (raw as any).type,
      opportunity_type: (raw as any).opportunity_type,
      opportunity_kind: (raw as any).opportunity_kind,
      application_url: (raw as any).application_url,
      deadline: (raw as any).deadline,
      source: (raw as any).source,
      is_active: (raw as any).is_active,
      verification_status: (raw as any).verification_status,
      deleted_at: (raw as any).deleted_at,
      archived_at: (raw as any).archived_at,
      created_at: (raw as any).created_at,
    })

    let effectiveSeoStatus = eligibility.seoStatus
    if (classification.publicationDecision === 'BLOCK') {
      effectiveSeoStatus = 'blocked'
    } else if (classification.publicationDecision === 'REVIEW' && effectiveSeoStatus === 'eligible') {
      effectiveSeoStatus = 'review'
    }

    let effectiveJpValidity = eligibility.jobpostingValidity
    if (classification.jobPostingDecision === 'SKIP' && effectiveJpValidity === 'valid') {
      effectiveJpValidity = 'incomplete'
    }

    const patch = {
      seo_status: effectiveSeoStatus,
      jobposting_validity: effectiveJpValidity,
      seo_issues: eligibility.issues,
      seo_missing_fields: eligibility.missingFields,
      seo_checked_at: new Date().toISOString(),
    }

    if (dryRun) {
      console.log('[seo-pipeline] DRY RUN', {
        id: opportunityId,
        seo_status: patch.seo_status,
        jobposting_validity: patch.jobposting_validity,
        publicationDecision: classification.publicationDecision,
      })
      return {
        ok: true,
        dryRun: true,
        opportunityId,
        seoStatus: effectiveSeoStatus,
        jobpostingValidity: effectiveJpValidity,
        missingFields: eligibility.missingFields,
        issueCount: eligibility.issues.length,
        publicationDecision: classification.publicationDecision,
        classificationReasons: classification.reasons,
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

    console.log('[seo-pipeline] ok', opportunityId, effectiveSeoStatus, effectiveJpValidity, classification.publicationDecision)

    // Enqueue indexing event — fire-and-forget, never blocks pipeline
    if (effectiveSeoStatus === 'eligible' && (raw as any).slug) {
      const oppType = (raw as any).opportunity_type
      const urlPrefix = ['job', 'internship', 'consultancy'].includes(oppType) ? 'empleos' : 'oportunidades'
      enqueueIndexingEvent({
        url: `https://cvitae.lat/${urlPrefix}/${(raw as any).slug}`,
        opportunityId,
        eventType: 'URL_UPDATED',
        supabase,
      }).catch(err => console.error('[seo-pipeline] indexing-queue error', err?.message))
    }

    return {
      ok: true,
      dryRun: false,
      opportunityId,
      seoStatus: effectiveSeoStatus,
      jobpostingValidity: effectiveJpValidity,
      missingFields: eligibility.missingFields,
      issueCount: eligibility.issues.length,
      publicationDecision: classification.publicationDecision,
      classificationReasons: classification.reasons,
    }
  } catch (err: any) {
    // Pipeline must never break callers
    console.error('[seo-pipeline] unexpected error', opportunityId, err?.message)
    return { ok: false, dryRun, opportunityId, error: err?.message || 'Unexpected error' }
  }
}

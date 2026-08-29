/**
 * Central SEO normalization layer.
 * All opportunity data MUST flow through this before being used in structured data,
 * eligibility checks, or AI suggestion prompts.
 */

import { toGoogleEmploymentType } from './employment-type'

/** Raw row from the opportunities table (only the fields relevant to SEO) */
export interface RawOpportunity {
  id: string
  slug: string | null
  title: string | null
  description: string | null
  organization: string | null
  location: string | null
  country_code: string | null
  city: string | null
  department: string | null
  type: string | null
  opportunity_type: string | null
  application_url: string | null
  deadline: string | null
  source: string | null
  is_active: boolean
  verification_status: string
  catalog_eligible: boolean
  seo_eligible: boolean
  deleted_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

/** Normalized, schema-ready opportunity — safe to use in structured data */
export interface NormalizedOpportunity {
  id: string
  slug: string | null
  title: string | null           // stripped HTML, trimmed, max 100 chars
  description: string | null     // stripped HTML, max 5000 chars
  organization: string | null
  addressLocality: string | null // city or location field
  addressRegion: string | null   // department/state field
  addressCountry: string         // ISO 3166-1 alpha-2 ('PY' default)
  employmentType: string | null  // valid Google Jobs value or null
  opportunityType: string | null // normalized opportunity_type
  applicationUrl: string | null  // https:// only, or null
  deadline: string | null        // ISO 8601 date string or null
  isJobPosting: boolean          // true = JobPosting schema; false = Scholarship schema
  isActive: boolean
  verificationStatus: string
  catalogEligible: boolean
  seoEligible: boolean
  deletedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

const SCHOLARSHIP_TYPES = new Set(['scholarship', 'fellowship', 'grant', 'research_funding'])

function stripHtml(raw: string | null | undefined, maxLen = 5000): string | null {
  if (!raw) return null
  const stripped = String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > 0 ? stripped.substring(0, maxLen) : null
}

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : null
  } catch {
    return null
  }
}

function normalizeDeadline(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return null
    // Reject deadlines in the past
    if (d < new Date()) return null
    return d.toISOString().split('T')[0]
  } catch {
    return null
  }
}

function normalizeCountry(code: string | null | undefined): string {
  if (!code) return 'PY'
  const upper = code.trim().toUpperCase()
  // Accept ISO 3166-1 alpha-2 (2 letters)
  return /^[A-Z]{2}$/.test(upper) ? upper : 'PY'
}

export function normalizeOpportunity(raw: RawOpportunity): NormalizedOpportunity {
  const title = stripHtml(raw.title, 100)
  const description = stripHtml(raw.description, 5000)
  const organization = stripHtml(raw.organization, 100)

  // location: prefer city field, then location field
  const addressLocality = stripHtml(raw.city || raw.location, 100)
  const addressRegion = stripHtml(raw.department, 100)

  const applicationUrl = normalizeUrl(raw.application_url)
  const employmentType = toGoogleEmploymentType(raw.type) ?? (raw.opportunity_type === 'internship' ? 'INTERN' : null)
  const deadline = normalizeDeadline(raw.deadline)
  const addressCountry = normalizeCountry(raw.country_code)
  const isJobPosting = !SCHOLARSHIP_TYPES.has(raw.opportunity_type || '')

  return {
    id: raw.id,
    slug: raw.slug,
    title: title || null,
    description: description || null,
    organization: organization || null,
    addressLocality,
    addressRegion,
    addressCountry,
    employmentType,
    opportunityType: raw.opportunity_type || null,
    applicationUrl,
    deadline,
    isJobPosting,
    isActive: raw.is_active,
    verificationStatus: raw.verification_status,
    catalogEligible: raw.catalog_eligible,
    seoEligible: raw.seo_eligible,
    deletedAt: raw.deleted_at,
    archivedAt: raw.archived_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

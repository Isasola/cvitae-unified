import { toGoogleEmploymentType } from './seo/employment-type.shared.js'
import { isISO3166Alpha2 } from '../../shared/iso-countries.ts'

const JOB_TYPES = new Set(['job', 'internship', 'consultancy', 'empleo'])

const clean = value =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/

function validIsoDate(value) {
  if (typeof value !== 'string') return false

  const raw = value.trim()

  if (!ISO_DATE.test(raw) && !ISO_DATETIME.test(raw)) return false

  return Number.isFinite(Date.parse(raw))
}

function factualPublishedAt(row) {
  return (
    row.source_posted_at ||
    row.employer_posted_at ||
    row.published_at ||
    null
  )
}

function isJobLike(row) {
  return JOB_TYPES.has(
    String(row.opportunity_type || row.opportunity_kind || '').toLowerCase()
  )
}

export function factualJobPosting(row, canonicalUrl) {
  const reasons = []

  if (!isJobLike(row)) {
    reasons.push('NOT_JOB_LIKE')
  }

  const title = clean(row.title)
  const description = clean(row.description)
  const organization = clean(row.organization || row.company)

  if (!title) reasons.push('MISSING_TITLE')

  if (description.length < 100) {
    reasons.push('MISSING_FACTUAL_DESCRIPTION')
  }

  if (!organization) {
    reasons.push('MISSING_FACTUAL_ORGANIZATION')
  }

  const datePosted = factualPublishedAt(row)

  if (!validIsoDate(datePosted)) {
    reasons.push('MISSING_FACTUAL_DATE_POSTED')
  }

  const country = clean(row.country_code).toUpperCase()

  if (!isISO3166Alpha2(country)) {
    reasons.push('MISSING_FACTUAL_COUNTRY')
  }

  const city = clean(row.city)
  const region = clean(row.department)

  if (!city && !region) {
    reasons.push('MISSING_FACTUAL_LOCATION')
  }

  const deadline =
    row.deadline == null || String(row.deadline).trim() === ''
      ? null
      : String(row.deadline).trim()

  if (deadline && !validIsoDate(deadline)) {
    reasons.push('INVALID_VALID_THROUGH')
  }

  if (reasons.length) {
    return {
      state: 'NOT_READY',
      reasons,
    }
  }

  const employmentType =
    toGoogleEmploymentType(row.type) ||
    (
      String(row.opportunity_type || row.opportunity_kind || '').toLowerCase()
        === 'internship'
        ? 'INTERN'
        : null
    )

  return {
    state: 'READY',
    reasons: [],
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title,
      description,
      url: canonicalUrl,
      datePosted,
      hiringOrganization: {
        '@type': 'Organization',
        name: organization,
      },
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressCountry: country,
          ...(city ? { addressLocality: city } : {}),
          ...(region ? { addressRegion: region } : {}),
        },
      },
      ...(deadline ? { validThrough: deadline } : {}),
      ...(employmentType ? { employmentType } : {}),
      directApply: row.first_party_direct_apply === true,
    },
  }
}

export function aggregatedJobPosting(row, canonicalUrl) {
  const factual = factualJobPosting(row, canonicalUrl)
  const reasons = [...factual.reasons]

  if (row.distribution?.jobPosting?.allowed !== true) {
    reasons.push('JOBPOSTING_NOT_ALLOWED')
  }

  if (reasons.length) {
    return {
      state: 'NOT_READY',
      reasons,
    }
  }

  return factual
}

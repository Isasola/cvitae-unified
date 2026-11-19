-- Fix stale jobposting_validity status.
-- The SEO pipeline ran in dry-run mode and never wrote computed statuses to the DB.
-- This migration applies the correct values for all active verified jobs in bulk.

-- Mark as valid: jobs that meet all required Google Jobs fields.
-- Criteria: title, description >=100 chars, organization, city or location, active, verified, not deleted/archived.
UPDATE opportunities
SET
  jobposting_validity = 'valid',
  seo_status = 'eligible',
  seo_missing_fields = '{}',
  seo_checked_at = NOW()
WHERE
  is_active = true
  AND opportunity_kind = 'empleo'
  AND verification_status = 'verified'
  AND deleted_at IS NULL
  AND archived_at IS NULL
  AND slug IS NOT NULL
  AND title IS NOT NULL AND length(title) >= 3
  AND description IS NOT NULL AND length(description) >= 100
  AND organization IS NOT NULL AND length(organization) > 2
  AND (city IS NOT NULL OR location IS NOT NULL);

-- Mark as incomplete with correct missing_fields for jobs missing description.
UPDATE opportunities
SET
  jobposting_validity = 'incomplete',
  seo_status = 'review',
  seo_missing_fields = ARRAY['description'],
  seo_checked_at = NOW()
WHERE
  is_active = true
  AND opportunity_kind = 'empleo'
  AND verification_status = 'verified'
  AND deleted_at IS NULL
  AND archived_at IS NULL
  AND slug IS NOT NULL
  AND title IS NOT NULL AND length(title) >= 3
  AND (description IS NULL OR length(description) < 100)
  AND organization IS NOT NULL AND length(organization) > 2
  AND (city IS NOT NULL OR location IS NOT NULL);

-- Mark as incomplete for jobs missing both description and organization.
UPDATE opportunities
SET
  jobposting_validity = 'incomplete',
  seo_status = 'review',
  seo_missing_fields = ARRAY['description', 'organization'],
  seo_checked_at = NOW()
WHERE
  is_active = true
  AND opportunity_kind = 'empleo'
  AND verification_status = 'verified'
  AND deleted_at IS NULL
  AND archived_at IS NULL
  AND slug IS NOT NULL
  AND title IS NOT NULL AND length(title) >= 3
  AND (description IS NULL OR length(description) < 100)
  AND (organization IS NULL OR length(organization) <= 2);

-- Mark as incomplete for jobs missing only organization.
UPDATE opportunities
SET
  jobposting_validity = 'incomplete',
  seo_status = 'review',
  seo_missing_fields = ARRAY['organization'],
  seo_checked_at = NOW()
WHERE
  is_active = true
  AND opportunity_kind = 'empleo'
  AND verification_status = 'verified'
  AND deleted_at IS NULL
  AND archived_at IS NULL
  AND slug IS NOT NULL
  AND title IS NOT NULL AND length(title) >= 3
  AND description IS NOT NULL AND length(description) >= 100
  AND (organization IS NULL OR length(organization) <= 2);

-- Normalize empty string type to NULL — empty string is not a valid employment type value.
UPDATE opportunities
SET type = NULL
WHERE
  is_active = true
  AND type = '';

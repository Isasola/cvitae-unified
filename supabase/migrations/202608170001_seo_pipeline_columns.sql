-- SEO Pipeline columns — additive only, never drops or modifies existing columns
-- Adds: seo_status, jobposting_validity, seo_issues, seo_missing_fields, seo_checked_at
-- All nullable — existing rows are unaffected until the pipeline runs on them

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS seo_status          text,
  ADD COLUMN IF NOT EXISTS jobposting_validity  text,
  ADD COLUMN IF NOT EXISTS seo_issues           jsonb,
  ADD COLUMN IF NOT EXISTS seo_missing_fields   text[],
  ADD COLUMN IF NOT EXISTS seo_checked_at       timestamptz;

-- Constraint: only accept known values (null = not yet evaluated)
ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_seo_status_check,
  ADD CONSTRAINT opportunities_seo_status_check
    CHECK (seo_status IS NULL OR seo_status IN ('eligible', 'review', 'blocked'));

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_jobposting_validity_check,
  ADD CONSTRAINT opportunities_jobposting_validity_check
    CHECK (jobposting_validity IS NULL OR jobposting_validity IN ('valid', 'incomplete', 'not_applicable'));

-- Index for admin queries filtering by SEO status
CREATE INDEX IF NOT EXISTS idx_opportunities_seo_status
  ON opportunities (seo_status)
  WHERE seo_status IS NOT NULL;

COMMENT ON COLUMN opportunities.seo_status IS
  'eligible = ready for sitemap + indexing; review = has warnings; blocked = excluded from SEO';
COMMENT ON COLUMN opportunities.jobposting_validity IS
  'valid = passes Google Jobs requirements; incomplete = missing required fields; not_applicable = Scholarship type';
COMMENT ON COLUMN opportunities.seo_issues IS
  'Array of {field, reason, severity} objects from the SEO eligibility check';
COMMENT ON COLUMN opportunities.seo_missing_fields IS
  'List of field names that are required but absent — targets for AI suggestions';
COMMENT ON COLUMN opportunities.seo_checked_at IS
  'Last time the SEO pipeline ran for this opportunity';

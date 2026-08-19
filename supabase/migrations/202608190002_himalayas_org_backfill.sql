-- Backfill Himalayas organization names from URL slug.
-- Pattern: https://himalayas.app/companies/{company-slug}/jobs/{job-slug}
-- Converts "mindplus-pvt-ltd" → "Mindplus Pvt Ltd"
-- Only affects records with placeholder organization values (not verified records).
-- Safe to re-run: only updates rows where org is still a known placeholder.

UPDATE public.opportunities
SET organization = initcap(
  replace(
    split_part(
      split_part(application_url, '/companies/', 2),
      '/jobs/', 1
    ),
    '-', ' '
  )
)
WHERE source = 'himalayas'
  AND lower(trim(coalesce(organization, ''))) IN ('name', '', 'n/a', '-', 'employer', 'company')
  AND application_url LIKE '%himalayas.app/companies/%/jobs/%'
  AND verification_status <> 'verified'
  AND deleted_at IS NULL;

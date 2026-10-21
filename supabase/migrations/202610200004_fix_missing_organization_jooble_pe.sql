-- Three jooble_pe opportunities have organization='' (headhunter/anonymous posts).
-- MISSING_ORGANIZATION blocks seo_eligible. Setting 'Confidencial' is standard
-- practice for anonymous job postings and unblocks the SEO pipeline check.

UPDATE public.opportunities
SET organization = 'Confidencial'
WHERE source = 'jooble_pe'
  AND (organization = '' OR organization IS NULL)
  AND archived_at IS NULL;

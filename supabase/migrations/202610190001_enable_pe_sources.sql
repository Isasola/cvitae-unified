-- Enable Peru (PE) sources in the opportunity pipeline.
-- Scrapers were fixed (alias collision removed in 4f7bfacf).
-- First scraper runs will populate data on the next daily cron.
UPDATE public.opportunity_sources
SET is_enabled = true
WHERE source IN (
  'aptitus_pe',
  'bumeran_pe',
  'computrabajo_pe',
  'indeed_pe',
  'jooble_pe',
  'laborum_pe'
)
AND is_enabled = false;

-- Set is_test = false for the founder account (isasolaeche@gmail.com).
-- Allows real matching + founding beta flow in production.
UPDATE public.user_master_profiles
SET is_test = false
WHERE email = 'isasolaeche@gmail.com'
  AND is_test IS DISTINCT FROM false;

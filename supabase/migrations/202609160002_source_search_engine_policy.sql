-- supabase/migrations/202609160002_source_search_engine_policy.sql
-- Adds tri-state organic SEO policy field to opportunity_sources.
--
-- search_engine_indexing_allowed:
--   NULL  = legacy / undefined — seo_enabled DB flag governs (existing behaviour preserved)
--   TRUE  = policy permits SEO consideration (gates + quality thresholds still required)
--   FALSE = explicitly denied — overrides seo_enabled regardless of other flags
--
-- NO backfill of historical rows. The 6,045 NULL-seo rows (Himalayas 5452, WWR 317,
-- UNJobs 276) derive POLICY_DENIED from this column via the application layer;
-- no UPDATE on existing opportunity rows is needed.

ALTER TABLE public.opportunity_sources
  ADD COLUMN IF NOT EXISTS search_engine_indexing_allowed BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.opportunity_sources.search_engine_indexing_allowed IS
  'Tri-state organic SEO policy. NULL=legacy (seo_enabled governs), TRUE=policy allows SEO, FALSE=explicitly denied by source contract.';

-- Set the 4 V2 sources to FALSE. These sources have TOS or distribution policy
-- restrictions that prohibit organic search engine indexing of their listings.
-- This matches the source contracts declared in source_cleaners/profiles.py.
UPDATE public.opportunity_sources
SET search_engine_indexing_allowed = FALSE
WHERE source IN ('unjobs', 'himalayas', 'talentcom', 'weworkremotely');

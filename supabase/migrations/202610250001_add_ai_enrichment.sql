-- AI-generated supplementary content for opportunity pages
-- Additive: never overwrites scraped/verified factual fields
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS ai_enrichment JSONB DEFAULT NULL;

COMMENT ON COLUMN opportunities.ai_enrichment IS
  'AI-generated supplementary context: {skills, ideal_profile, application_tips, sector_context, generated_at}';

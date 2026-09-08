-- Add source_tier to opportunity_sources for auto-blog generator and admin controls.
-- SS = super segura (auto-blog eligible), S = segura, A = normal, B = dudosa
ALTER TABLE public.opportunity_sources
  ADD COLUMN IF NOT EXISTS source_tier TEXT DEFAULT 'A'
    CHECK (source_tier IN ('SS', 'S', 'A', 'B'));

-- Seed initial tiers based on known source quality
UPDATE public.opportunity_sources SET source_tier = 'SS'
  WHERE source IN ('oas_scholarships', 'erasmus_mundus', 'coimbra_group', 'mitic_opportunities', 'snj_paraguay');

UPDATE public.opportunity_sources SET source_tier = 'S'
  WHERE source IN ('computrabajo', 'weworkremotely', 'himalayas', 'unjobs', 'eu_delegation_paraguay');

UPDATE public.opportunity_sources SET source_tier = 'B'
  WHERE source IN ('clasipar', 'buscojobs');

CREATE INDEX IF NOT EXISTS idx_opportunity_sources_tier
  ON public.opportunity_sources (source_tier);

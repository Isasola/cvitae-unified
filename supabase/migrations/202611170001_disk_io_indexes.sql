-- Reduce Disk IO: targeted partial indexes for the 4 heaviest query patterns
-- 1. SEO pipeline bulk scan (seo_status IS NULL full-table scan at night)
CREATE INDEX IF NOT EXISTS idx_opportunities_seo_pipeline
  ON public.opportunities (created_at ASC)
  WHERE seo_status IS NULL
    AND verification_status = 'verified'
    AND is_active = true
    AND deleted_at IS NULL;

-- 2. Active catalog count (admin metrics + sitemap, adds deleted_at to match_eligible_idx)
CREATE INDEX IF NOT EXISTS idx_opportunities_active_verified
  ON public.opportunities (id)
  WHERE is_active = true
    AND verification_status = 'verified'
    AND deleted_at IS NULL;

-- 3. BRIN on created_at (lightweight insert-friendly index for time-range scans)
CREATE INDEX IF NOT EXISTS idx_opportunities_created_at_brin
  ON public.opportunities USING brin (created_at);

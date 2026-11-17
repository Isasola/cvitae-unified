-- Composite indexes for admin opportunity review queries (list_opportunity_reviews)
CREATE INDEX IF NOT EXISTS opp_review_status_created_idx
  ON opportunities (verification_status, created_at DESC)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS opp_review_source_idx
  ON opportunities (source, created_at DESC)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

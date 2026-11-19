-- SEO AI Suggestions table — additive, never modifies existing tables
-- Stores AI-generated field suggestions for admin review before applying

CREATE TABLE IF NOT EXISTS seo_suggestions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  field          text NOT NULL,        -- which field the suggestion is for (e.g. 'title', 'employmentType')
  current_value  text,                 -- current value in the DB (may be null)
  suggested_value text NOT NULL,       -- what the AI suggests
  confidence     numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence       text,                 -- brief justification from the model
  source         text NOT NULL,        -- 'bedrock-claude' or similar
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'edited', 'ignored')),
  applied_value  text,                 -- what was actually applied (if accepted/edited)
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One active suggestion per field per opportunity (upsert pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_suggestions_active
  ON seo_suggestions (opportunity_id, field)
  WHERE status = 'pending';

-- Fast lookup for admin UI
CREATE INDEX IF NOT EXISTS idx_seo_suggestions_status
  ON seo_suggestions (status, created_at DESC);

COMMENT ON TABLE seo_suggestions IS
  'AI-generated field suggestions for SEO improvement. Never auto-applied — requires admin review.';
COMMENT ON COLUMN seo_suggestions.confidence IS
  'Model confidence 0-1. Batch-accept only allowed for confidence >= 0.95 AND safe fields only.';
COMMENT ON COLUMN seo_suggestions.field IS
  'Safe fields for batch-accept: title, employmentType, location. NEVER salary, exact_address.';

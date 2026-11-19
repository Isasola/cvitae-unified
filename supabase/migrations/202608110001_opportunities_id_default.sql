-- Every opportunity producer upserts by application_url and should not have to
-- coordinate identifiers. The public contract uses TEXT ids, so generate a
-- UUID-compatible textual id at the database boundary.
ALTER TABLE public.opportunities
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

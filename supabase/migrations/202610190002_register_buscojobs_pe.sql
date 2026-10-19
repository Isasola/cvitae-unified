-- Register buscojobs_pe as a trusted PE source with auto-verify.
-- Disable aptitus_pe and infojobs_pe (dead URLs confirmed 2026-10-19).
INSERT INTO public.opportunity_sources
  (source, display_name, country_code, trust_level, auto_verify, is_enabled,
   catalog_enabled, matching_enabled, alerts_enabled, seo_enabled,
   allowed_country_codes, notes, updated_by)
VALUES
  ('buscojobs_pe', 'BuscoJobs Perú', 'PE', 'trusted', true, true,
   true, true, true, true,
   ARRAY['PE'], 'Portal peruano activo; registrado 2026-10-19.', 'migration')
ON CONFLICT (source) DO UPDATE SET
  display_name       = EXCLUDED.display_name,
  country_code       = EXCLUDED.country_code,
  trust_level        = EXCLUDED.trust_level,
  auto_verify        = EXCLUDED.auto_verify,
  is_enabled         = EXCLUDED.is_enabled,
  catalog_enabled    = EXCLUDED.catalog_enabled,
  matching_enabled   = EXCLUDED.matching_enabled,
  alerts_enabled     = EXCLUDED.alerts_enabled,
  seo_enabled        = EXCLUDED.seo_enabled,
  allowed_country_codes = EXCLUDED.allowed_country_codes,
  notes              = EXCLUDED.notes,
  updated_by         = EXCLUDED.updated_by,
  updated_at         = now();

-- Disable dead PE portals so their quarantined opportunities are ignored.
UPDATE public.opportunity_sources
SET is_enabled  = false,
    notes       = 'Deshabilitado 2026-10-19: URL muerta (Apache default page).',
    updated_by  = 'migration',
    updated_at  = now()
WHERE source IN ('aptitus_pe', 'infojobs_pe')
  AND is_enabled IS DISTINCT FROM false;

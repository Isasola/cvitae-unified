# Source permission and row readiness migration

`202609200001_source_permission_row_readiness.sql` changes only the bulk
propagation of `matching_enabled` in `admin_update_source_policy_atomic`.

- `matching_enabled=false` remains a source-level kill-switch and sets existing
  active, verified rows to `match_eligible=false`.
- `matching_enabled=true` changes only source permission. It does not promote
  any row; the factory/policy path must establish row readiness independently.

The prior function bulk-mirrored `catalog_enabled`, `matching_enabled`,
`alerts_enabled`, and `seo_enabled` into row eligibility. The local migration
stops that bulk mirroring for all four flags. Their source flags remain stored
and therefore callers must use **source permission AND row readiness** before
the migration is applied.

Consumers needing that effective-policy join:

- B2C matching and alerts: `opportunity_sources.matching_enabled` AND
  `opportunities.match_eligible` (matching has been updated locally).
- Catalog/public routes: `web_catalog_allowed`/`catalog_enabled` AND
  `catalog_eligible`.
- SEO, sitemap and prerender: source search/SEO permission AND row
  `seo_eligible`/`seo_status`.
- JobPosting/Google Jobs: Google-Jobs distribution permission AND row-level
  structured-data readiness.
- Alerts: `alerts_enabled` AND `alerts_eligible`, in addition to matching
  policy/readiness.

Do not apply this migration until those remaining catalog, SEO and alert
consumers have been migrated and verified locally.

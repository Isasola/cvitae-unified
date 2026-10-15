-- READ ONLY. Operator may run after the release is separately authorized.
-- Contains SELECT statements only; no DML, DDL, RPC with side effects, or PII.

SELECT
  (SELECT count(*) FROM public.opportunities) AS opportunities_total,
  (SELECT count(*) FROM public.opportunities WHERE is_active IS TRUE AND deleted_at IS NULL) AS active_not_deleted,
  (SELECT count(*) FROM public.opportunity_universe_state) AS universe_rows,
  (SELECT count(*) FROM public.opportunity_universe_state WHERE lifecycle_state = 'ACTIVE_VALID') AS lifecycle_active_valid,
  (SELECT count(*) FROM public.opportunity_universe_state WHERE matching_row_state = 'READY') AS matching_row_ready,
  (SELECT count(*) FROM public.opportunity_universe_state WHERE final_matching_state = 'READY') AS final_matching_ready,
  (SELECT count(*) FROM public.opportunity_universe_state WHERE catalog_state = 'READY') AS catalog_ready,
  (SELECT count(*) FROM public.opportunity_universe_state WHERE alerts_state = 'READY') AS alerts_ready,
  (SELECT count(*) FROM public.opportunity_universe_state WHERE seo_state = 'READY') AS seo_ready;

-- The lifecycle dimension uses the SQL contract ACTIVE_VALID (not READY).
SELECT lifecycle_state, count(*) AS rows
FROM public.opportunity_universe_state
GROUP BY lifecycle_state
ORDER BY lifecycle_state;

-- Current/persisted source policy is shown beside the effective C09 result.
SELECT
  s.source,
  s.matching_enabled AS stored_matching_enabled,
  public.canonical_opportunity_source_policy(s.source)->>'matching_enabled' AS effective_matching_enabled,
  count(u.opportunity_id) AS universe_rows,
  count(*) FILTER (WHERE u.matching_row_state = 'READY') AS matching_row_ready,
  count(*) FILTER (WHERE u.final_matching_state = 'READY') AS final_matching_ready,
  count(*) FILTER (WHERE u.final_matching_state = 'UNKNOWN') AS final_matching_unknown
FROM public.opportunity_sources s
LEFT JOIN public.opportunities o
  ON lower(o.source) = lower(s.source)
  OR lower(o.source) IN (
    SELECT a.emitted_source
    FROM public.opportunity_source_identity_aliases a
    WHERE lower(a.canonical_source) = lower(s.source)
  )
LEFT JOIN public.opportunity_universe_state u ON u.opportunity_id = o.id::text
WHERE s.source IN ('himalayas','weworkremotely','unjobs','computrabajo','opportunitydesk','jobicy','remotive')
GROUP BY s.source, s.matching_enabled
ORDER BY s.source;

-- The durable Universe queue: counts and bounded sample, no cursor payload exposed.
SELECT
  count(*) AS pending_sources,
  min(queued_at) AS oldest_queued_at,
  count(*) FILTER (WHERE cursor_id IS NOT NULL) AS sources_with_cursor,
  coalesce(jsonb_agg(jsonb_build_object(
    'canonical_source', canonical_source,
    'queued_at', queued_at,
    'reason', reason,
    'cursor_present', cursor_id IS NOT NULL
  ) ORDER BY queued_at, canonical_source) FILTER (WHERE rn <= 25), '[]'::jsonb) AS oldest_sample
FROM (
  SELECT d.*, row_number() OVER (ORDER BY queued_at, canonical_source) AS rn
  FROM public.opportunity_universe_dirty_sources d
) q;

-- The new collector must remain closed until its explicit approval sequence.
SELECT scraper_id, collection_enabled, max_items_per_run, max_runtime_seconds,
       auto_pause_on_failure, require_review, allowed_country_codes, paused_reason
FROM public.scraper_controls
WHERE scraper_id = 'paraguayconcursa_mef_scraper';

-- WWR's reviewed SEO restriction is a consumer permission, independent of switches.
-- This query is read-only and does not imply permission from row counts.
SELECT canonical_source, consumer, permission_state, reason, evidence_type,
       provenance, evidence_reference, verified_at
FROM public.opportunity_source_consumer_permissions
WHERE canonical_source = 'weworkremotely' AND consumer = 'seo_index';

SELECT o.source,
       count(*) FILTER (WHERE u.seo_state = 'READY') AS persisted_seo_ready,
       count(*) FILTER (WHERE u.seo_state = 'READY' AND v.id IS NULL) AS ready_but_excluded_from_effective_view
FROM public.opportunities o
JOIN public.opportunity_universe_state u ON u.opportunity_id = o.id::text
LEFT JOIN public.opportunity_seo_universe v ON v.id = o.id
WHERE lower(o.source) IN ('weworkremotely','wwr')
GROUP BY o.source
ORDER BY o.source;

-- Read-only estimate of rows whose persisted SEO content gate would be
-- reconciled by the additive factual-content parity migration. No opportunity
-- fields, matching, catalog, alerts, or candidate data are returned.
SELECT
  count(*) FILTER (WHERE u.seo_row_state='READY') AS seo_row_ready,
  count(*) FILTER (WHERE u.seo_row_state='READY' AND (
    nullif(trim(o.title),'') IS NULL
    OR lower(trim(o.title)) ~ '^(breadcrumb(\s+[0-9]+)?|vacantes?|empleos?|jobs?|oportunidades?|inicio|home|ver m[aá]s|read more|detalle)$'
    OR nullif(trim(o.slug),'') IS NULL
    OR lower(trim(o.description))=lower(trim(o.title))
    OR lower(trim(o.description))=lower(trim(o.title))||'.'
    OR length(regexp_replace(lower(trim(coalesce(o.description,''))), '\s+', ' ', 'g'))<100
    OR (SELECT count(DISTINCT token) FROM regexp_split_to_table(lower(trim(coalesce(o.description,''))), '[^[:alnum:]]+') AS words(token) WHERE length(token)>=3)<12
    OR nullif(trim(o.organization),'') IS NULL
  )) AS content_gate_rows_to_reconcile
FROM public.opportunities o
JOIN public.opportunity_universe_state u ON u.opportunity_id=o.id::text
WHERE u.lifecycle_state='ACTIVE_VALID';

-- Aggregate only: no candidate rows or profile/PII data.
SELECT source, count(*) AS rows,
       count(*) FILTER (WHERE is_active IS TRUE AND deleted_at IS NULL) AS active_not_deleted
FROM public.opportunities
WHERE source IN ('paraguayconcursa_mef','getonbrd','greenhouse','lever','smartrecruiters','jooble_pe','unjobs')
GROUP BY source
ORDER BY source;

-- Local-only, evidence-based source capability correction. Apply only after
-- the policy boundary and consumer parity checks are deployed together.
--
-- Source capability is not row readiness: every opportunity still passes the
-- canonical Opportunity Truth/readiness evaluator independently. Enabling
-- matching/alerts here only permits those consumers at source level; it does
-- not mass-promote or backfill any opportunity row. Google Jobs and
-- third-party distribution remain untouched here.
--
-- UNJobs is the only one of the six candidates with a current certified V2
-- adapter, live-validation evidence and AUTO certification. No current
-- repository evidence documents a UNJobs search/usage prohibition; the older
-- FALSE search flag is historical safety configuration, not a contract deny.
-- Therefore this migration restores the supported CVitae-owned catalog/SEO
-- capability for the canonical `unjobs` source only.
update public.opportunity_sources
set web_catalog_allowed = true,
    search_engine_indexing_allowed = true,
    is_enabled = true,
    catalog_enabled = true,
    matching_enabled = true,
    alerts_enabled = true,
    seo_enabled = true
where source = 'unjobs';

-- computrabajo, weworkremotely, eu_delegation_paraguay, opportunitydesk and
-- oya remain unchanged: their current Registry evidence is either
-- uncertified or unvalidated. They require review/live certification before
-- source capability is enabled. The canonical `oya` identity is intentionally
-- not inferred from or promoted through the emitted alias `oyaop`.

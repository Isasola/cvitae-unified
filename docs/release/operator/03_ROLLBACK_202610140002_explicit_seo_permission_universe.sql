-- DO NOT RUN WITHOUT EXPLICIT RELEASE APPROVAL.
-- This is an optimistic rollback guard. It never restores row-state snapshots.
-- If the migration installed any explicit OFFICIAL_* consumer denial (including
-- the WWR terms), or reconciled any Universe row, it aborts without changing
-- anything. Revoking those restrictions requires separate authorization and a
-- forward, canonical re-evaluation plan. WWR evidence is never deleted here.
BEGIN;

DO $rollback_guard$
DECLARE
  migration_rows bigint;
  explicit_denials bigint;
BEGIN
  SELECT count(*) INTO migration_rows
  FROM public.opportunity_universe_state
  WHERE provenance->'seo_content_quality_reconciliation'->>'migration'='202610140002_explicit_seo_permission_universe'
     OR provenance->'explicit_consumer_permission_reconciliation'->>'migration'='202610140002_explicit_seo_permission_universe'
     OR provenance->'explicit_consumer_denials' IS NOT NULL;

  SELECT count(*) INTO explicit_denials
  FROM public.opportunity_source_consumer_permissions
  WHERE permission_state='DENIED'
    AND evidence_type LIKE 'OFFICIAL_%'
    AND nullif(trim(provenance),'') IS NOT NULL
    AND nullif(trim(evidence_reference),'') IS NOT NULL;

  IF migration_rows > 0 OR explicit_denials > 0 THEN
    RAISE EXCEPTION 'SAFE_ROLLBACK_BLOCKED: universe_rows=%, explicit_official_denials=%. No row state or permission was changed. Preserve the evidence and use a reviewed forward migration; revoking a source restriction requires separate authorization.',
      migration_rows, explicit_denials;
  END IF;
END $rollback_guard$;

-- Restore the pre-140002 source-permission trigger behavior only on the guarded
-- no-restriction/no-reconciled-row path. This is the function body installed by
-- the existing 040001 migration; the trigger itself is not replaced.
CREATE OR REPLACE FUNCTION public.opportunity_permission_refresh_universe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_has_reconciled_rows boolean:=false;
BEGIN
  IF TG_OP='INSERT' OR (OLD.permission_state,OLD.reason,OLD.provenance,OLD.evidence_type,OLD.evidence_reference) IS DISTINCT FROM
      (NEW.permission_state,NEW.reason,NEW.provenance,NEW.evidence_type,NEW.evidence_reference) THEN
    SELECT EXISTS(
      SELECT 1 FROM public.opportunity_universe_state u
      JOIN public.opportunities o ON o.id::text=u.opportunity_id
      WHERE lower(trim(o.source))=NEW.canonical_source OR lower(trim(o.source)) IN
        (SELECT emitted_source FROM public.opportunity_source_identity_aliases WHERE canonical_source=NEW.canonical_source)
    ) INTO v_has_reconciled_rows;
    IF v_has_reconciled_rows THEN
      INSERT INTO public.opportunity_universe_dirty_sources(canonical_source,reason)
      VALUES(NEW.canonical_source,'SOURCE_PERMISSION_CHANGED')
      ON CONFLICT(canonical_source) DO UPDATE SET queued_at=now(),reason=excluded.reason,cursor_id=null;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- This branch is reachable only when the migration has not reconciled rows and
-- there are no explicit official denials whose enforcement would be removed.
DO $rollback_view$
DECLARE opportunity_columns text;
BEGIN
  IF (SELECT atttypid FROM pg_attribute WHERE attrelid='public.opportunities'::regclass AND attname='id' AND NOT attisdropped) <> 'text'::regtype THEN
    RAISE EXCEPTION 'SEO read path expects the existing opportunities.id text contract';
  END IF;
  SELECT string_agg(CASE WHEN attname='id' THEN 'u.opportunity_id as id'
    ELSE format('o.%I',attname) END, ', ' ORDER BY attnum)
  INTO opportunity_columns
  FROM pg_attribute
  WHERE attrelid='public.opportunities'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format($view$
CREATE OR REPLACE VIEW public.opportunity_seo_universe
WITH (security_invoker=true) AS
WITH effective_policies AS MATERIALIZED (
  SELECT DISTINCT public.canonical_opportunity_source_policy(s.source) policy
  FROM public.opportunity_sources s
)
SELECT %s, u.lifecycle_state AS universe_lifecycle_state,
  u.seo_state AS universe_seo_state
FROM public.opportunity_universe_state u
JOIN LATERAL (
  SELECT candidate.*
  FROM public.opportunities candidate
  WHERE candidate.id = u.opportunity_id
    AND public.opportunity_deadline_state(candidate.deadline) IN ('OPEN','UNKNOWN')
  LIMIT 1
) o ON o.id = u.opportunity_id
LEFT JOIN public.opportunity_source_identity_aliases a
  ON a.emitted_source=lower(trim(o.source))
JOIN LATERAL (
  SELECT p.policy
  FROM effective_policies p
  WHERE p.policy->>'canonical_source'=coalesce(a.canonical_source,lower(trim(o.source)))
    AND p.policy->>'is_enabled'='true'
    AND p.policy->>'seo_enabled' IS DISTINCT FROM 'false'
  LIMIT ALL
) p ON true
WHERE u.seo_state='READY'
ORDER BY u.opportunity_id
$view$, opportunity_columns);
END $rollback_view$;

DROP TRIGGER IF EXISTS opportunity_universe_explicit_consumer_denials ON public.opportunity_universe_state;
DROP FUNCTION IF EXISTS public.enforce_explicit_consumer_denials();
DROP FUNCTION IF EXISTS public.source_seo_explicitly_denied(text);
DROP FUNCTION IF EXISTS public.source_consumer_explicitly_denied(text,text);
DROP FUNCTION IF EXISTS public.source_seo_row_readiness_reason(text,text,text,text);

-- Deliberately no UPDATE/DELETE of opportunity state or permission evidence.
COMMIT;

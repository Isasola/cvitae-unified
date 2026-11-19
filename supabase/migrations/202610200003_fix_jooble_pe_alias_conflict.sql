-- jooble_pe was aliased to canonical 'jooble' (a disabled WW source), causing
-- stored_opportunity_source_policy('jooble_pe') to return alias_conflict=true and
-- all permission flags null. Remove the wrong alias so jooble_pe resolves to its
-- own row in opportunity_sources (which has matching_enabled=true, country_code=PE).
-- Also queue re-evaluation for both jooble_pe and computrabajo (stale universe state).

begin;

-- Remove wrong alias: jooble_pe → jooble
DELETE FROM public.opportunity_source_identity_aliases
WHERE emitted_source = 'jooble_pe'
  AND canonical_source = 'jooble';

-- Queue jooble_pe and computrabajo for universe re-evaluation on next cron cycle.
-- jooble_pe: alias conflict now removed, source policy will resolve correctly.
-- computrabajo: source_matching_state was stale (policy is already correct).
INSERT INTO public.opportunity_universe_dirty_sources (canonical_source, reason)
VALUES
  ('jooble_pe',    'ALIAS_CONFLICT_RESOLVED'),
  ('computrabajo', 'UNIVERSE_STATE_STALE_REFRESH')
ON CONFLICT (canonical_source) DO UPDATE
  SET queued_at = clock_timestamp(),
      reason    = excluded.reason,
      cursor_id = null;

commit;

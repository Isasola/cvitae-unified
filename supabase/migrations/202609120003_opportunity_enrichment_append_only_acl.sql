-- Application-level append-only ACL for enrichment audit events.
revoke all on table public.opportunity_enrichment_events from service_role;
grant select, insert on table public.opportunity_enrichment_events to service_role;

revoke all on table public.opportunity_enrichment_events from public, anon, authenticated;

comment on table public.opportunity_enrichment_events is
  'Append-only enrichment audit: service_role has SELECT and INSERT only.';

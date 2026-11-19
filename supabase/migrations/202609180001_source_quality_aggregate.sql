-- P0.1: Server-side fingerprint pending aggregate to replace client-side
-- opportunities.limit(10000) sample used in sourceIntelligenceSnapshot.
--
-- Fix: moved count(*) FILTER into a GROUP BY subquery to avoid PostgreSQL's
-- restriction on nesting aggregate functions inside other aggregate functions
-- (SQLSTATE 42803).
create or replace function public.admin_source_quality_aggregate()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_object_agg(
        coalesce(source, 'unknown'),
        jsonb_build_object(
          'fingerprint_pending', fingerprint_pending
        )
      )
      from (
        select
          source,
          count(*) filter (where match_eligible = true and semantic_fingerprint is null)
            as fingerprint_pending
        from public.opportunities
        where deleted_at is null and archived_at is null
        group by source
      ) sub
    ),
    '{}'::jsonb
  )
$$;

revoke all on function public.admin_source_quality_aggregate() from public, anon, authenticated;
grant execute on function public.admin_source_quality_aggregate() to service_role;

comment on function public.admin_source_quality_aggregate() is
  'Per-source fingerprint pending counts over full DB. Read-only.';

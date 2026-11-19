-- READ ONLY / run after 202610110001 and before preparing the historical C4 queue.
-- Full inventory denominator and identity projection only. This does not create
-- the immutable membership; the separately authorized prepare RPC does that.
begin transaction read only;
set local statement_timeout='120s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true) operator_role_context;

with projected as materialized (
  select o.id::text opportunity_id,o.source raw_source,
    public.private_matching_c4_source_identity(o.source) identity
  from public.opportunities o
)
select count(*) inventory_members,count(distinct opportunity_id) unique_members,
  count(*) filter(where identity->>'state'='RESOLVED') resolved_members,
  count(*) filter(where identity->>'state'<>'RESOLVED') identity_review_members,
  count(*)-count(distinct opportunity_id) duplicate_members
from projected;

with projected as materialized (
  select o.id::text opportunity_id,
    public.private_matching_c4_source_identity(o.source) identity
  from public.opportunities o
)
select identity->>'state' identity_state,identity->>'reason' identity_reason,
  identity->>'canonical_source' canonical_source,count(*) members
from projected
group by identity->>'state',identity->>'reason',identity->>'canonical_source'
order by identity_state,identity_reason,canonical_source;

with projected as materialized (
  select o.id::text opportunity_id,identity.value identity,
    coalesce(u.final_matching_state,'MISSING') current_final,
    case when identity.value->>'state'='RESOLVED' then
      public.opportunity_universe_decision(to_jsonb(o),obs.observation,
        public.canonical_opportunity_source_policy(o.source),to_jsonb(u))
      else jsonb_build_object('final_matching_state','IDENTITY_REVIEW',
        'first_failure',identity.value->>'reason') end decision
  from public.opportunities o
  cross join lateral (select public.private_matching_c4_source_identity(o.source) value) identity
  left join public.opportunity_universe_state u on u.opportunity_id=o.id::text
  left join lateral (
    select to_jsonb(s) observation from public.opportunity_source_observations s
    where s.opportunity_id::text=o.id::text order by s.observed_at desc,s.id desc limit 1
  ) obs on true
)
select identity->>'state' identity_state,identity->>'canonical_source' canonical_source,
  count(*) members,count(*) filter(where current_final='READY') current_ready,
  count(*) filter(where current_final='UNKNOWN') current_unknown,
  count(*) filter(where current_final='NOT_READY') current_not_ready,
  count(*) filter(where current_final='MISSING') current_missing,
  count(*) filter(where decision->>'final_matching_state'='READY') projected_ready,
  count(*) filter(where decision->>'final_matching_state'='UNKNOWN') projected_unknown,
  count(*) filter(where decision->>'final_matching_state'='NOT_READY') projected_not_ready,
  count(*) filter(where decision->>'final_matching_state'='IDENTITY_REVIEW') identity_review,
  count(*) filter(where current_final is distinct from decision->>'final_matching_state') projected_changes
from projected group by identity->>'state',identity->>'canonical_source'
order by identity_state,canonical_source;

-- An emitted name that is also a different registered canonical name is not
-- guessed: the explicit alias wins and the collision reason remains visible.
select a.emitted_source,a.canonical_source alias_target,
  public.private_matching_c4_source_identity(a.emitted_source) resolution
from public.opportunity_source_identity_aliases a
where exists(select 1 from public.opportunity_sources s
  where lower(s.source)=a.emitted_source)
  and a.canonical_source<>a.emitted_source
order by a.emitted_source,a.canonical_source;

-- Any duplicate/contradictory alias authority is a STOP for those members;
-- they remain in the snapshot under an IDENTITY_REVIEW bucket.
select emitted_source normalized_emitted_source,count(*) alias_rows,
  count(distinct canonical_source) canonical_targets
from public.opportunity_source_identity_aliases
group by emitted_source
having count(*)>1 or count(distinct canonical_source)>1
order by normalized_emitted_source;

select public.private_matching_c4_contract_digests() reproducible_contract_digests;

select 'c6dcc71299db2237f17d455729d238a7' legacy_recruiter_reference_digest,
  'REFERENCE_ONLY_DIFFERENT_HISTORICAL_ALGORITHM_NOT_COMPARABLE' comparison_rule;

select count(*) recruiter_vacancies,count(o.id) mirrors,
  count(*) filter(where r.recruiter_token_id is null or t.id is null) owner_missing,
  count(*) filter(where o.id is not null and r.is_active) open_mirrors,
  count(*) filter(where o.id is not null and not r.is_active) closed_mirrors
from public.recruiter_vacancies r
left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
left join public.opportunities o on o.recruiter_vacancy_id=r.id and o.source='recruiter_b2b';

rollback;

-- LOCAL ONLY. Operational continuation for the existing alert sender.
-- No permission, readiness, retrieval or scoring authority is changed.
alter table public.matching_retrieval_scheduler_state add column if not exists alert_profile_cursor uuid;
create table if not exists public.match_alert_scan_progress (
  profile_id uuid primary key references public.user_master_profiles(id) on delete cascade,
  checkpoint jsonb not null default '{}'::jsonb,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(checkpoint)='object'),
  check (not (checkpoint ? 'pending') or
    (jsonb_typeof(checkpoint->'pending')='array' and jsonb_array_length(checkpoint->'pending')<=100))
);
alter table public.match_alert_scan_progress enable row level security;
revoke all on public.match_alert_scan_progress from public,anon,authenticated;
grant select,insert,update,delete on public.match_alert_scan_progress to service_role;
create index if not exists user_master_profiles_alert_walk_idx on public.user_master_profiles(id)
  where match_alerts_enabled and email is not null and user_id is not null and (is_test is null or is_test=false);
-- Reuse opportunity_enrichment_events_opportunity_created_idx for the latest evidence lookup.
create index if not exists scraper_runs_maintenance_progress_idx on public.scraper_runs(scraper_id,
  (extraction_metrics->>'maintenance_lane'),(extraction_metrics->'maintenance_progress'->>'opportunity_id'),
  started_at desc,finished_at desc);
create index if not exists matching_retrieval_candidates_alert_cursor_idx
  on public.matching_retrieval_candidates(user_id,evaluated_at,opportunity_id) where candidate_class='MATCH';
create index if not exists opportunities_maintenance_cursor_idx on public.opportunities(source,id)
  where deleted_at is null and archived_at is null;

create or replace function public.claim_match_alert_scan() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_cursor uuid; v_profile public.user_master_profiles%rowtype; v_state jsonb; v_token uuid:=gen_random_uuid();
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  select alert_profile_cursor into v_cursor from public.matching_retrieval_scheduler_state
    where singleton for update skip locked;
  if not found then return jsonb_build_object('profile',null,'resumable',true,'reason','SELECTOR_BUSY'); end if;
  select p.* into v_profile from public.user_master_profiles p
    where p.match_alerts_enabled and p.email is not null and p.user_id is not null and (p.is_test is null or p.is_test=false)
      and (v_cursor is null or p.id>v_cursor)
      and not exists(select 1 from public.match_alert_scan_progress s where s.profile_id=p.id and s.lease_until>now())
    order by p.id limit 1;
  if not found then
    select p.* into v_profile from public.user_master_profiles p
      where p.match_alerts_enabled and p.email is not null and p.user_id is not null and (p.is_test is null or p.is_test=false)
        and not exists(select 1 from public.match_alert_scan_progress s where s.profile_id=p.id and s.lease_until>now())
      order by p.id limit 1;
  end if;
  if not found then return jsonb_build_object('profile',null,'resumable',true,'reason','NO_AVAILABLE_PROFILE'); end if;
  insert into public.match_alert_scan_progress(profile_id,lease_token,lease_until)
    values(v_profile.id,v_token,now()+interval '60 seconds')
    on conflict(profile_id) do update set lease_token=excluded.lease_token,lease_until=excluded.lease_until
    where public.match_alert_scan_progress.lease_until is null or public.match_alert_scan_progress.lease_until<=now()
    returning checkpoint into v_state;
  if not found then return jsonb_build_object('profile',null,'resumable',true,'reason','PROFILE_BUSY'); end if;
  -- Separate column: never change Matching's existing profile_cursor.
  update public.matching_retrieval_scheduler_state set alert_profile_cursor=v_profile.id where singleton;
  return jsonb_build_object('profile',jsonb_build_object('id',v_profile.id,'user_id',v_profile.user_id,
    'email',v_profile.email,'full_name',v_profile.full_name,'professional_title',v_profile.professional_title,
    'summary',v_profile.summary,'cv_text',v_profile.cv_text,'profile_data',v_profile.profile_data,
    'match_alert_threshold',v_profile.match_alert_threshold),'checkpoint',v_state,'lease_token',v_token);
end $$;

create or replace function public.save_match_alert_scan(p_profile_id uuid,p_lease_token uuid,p_checkpoint jsonb,p_release boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  if octet_length(p_checkpoint::text)>131072 then raise exception 'checkpoint_budget_exceeded'; end if;
  update public.match_alert_scan_progress set checkpoint=p_checkpoint,updated_at=now(),
    lease_token=case when p_release then null else lease_token end,
    lease_until=case when p_release then null else lease_until end
    where profile_id=p_profile_id and lease_token=p_lease_token and lease_until>now();
  if not found then raise exception 'alert_scan_lease_lost'; end if;
  return true;
end $$;

-- Latest enrichment evidence for only the current maintenance page.
create or replace function public.latest_maintenance_enrichments(p_opportunity_ids text[])
returns table(opportunity_id text,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  if coalesce(cardinality(p_opportunity_ids),0)>250 then raise exception 'maintenance_page_limit_exceeded'; end if;
  return query select ids.id,e.created_at from unnest(p_opportunity_ids) ids(id)
    cross join lateral (select x.created_at from public.opportunity_enrichment_events x
      where x.opportunity_id=ids.id order by x.created_at desc limit 1) e;
end $$;
revoke all on function public.claim_match_alert_scan() from public,anon,authenticated;
revoke all on function public.save_match_alert_scan(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.latest_maintenance_enrichments(text[]) from public,anon,authenticated;
grant execute on function public.claim_match_alert_scan(),public.save_match_alert_scan(uuid,uuid,jsonb,boolean),public.latest_maintenance_enrichments(text[]) to service_role;

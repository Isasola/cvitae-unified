-- B2C security boundary: browser users own their profile content, while plan,
-- test and embedding fields remain server-managed. API limits are persistent
-- and atomic so serverless cold starts cannot reset them.

revoke all on table public.user_master_profiles from anon, authenticated;
grant select on table public.user_master_profiles to authenticated;
grant insert (
  user_id, full_name, professional_title, summary, profile_data,
  match_alerts_enabled, match_alert_threshold
) on table public.user_master_profiles to authenticated;
grant update (
  full_name, professional_title, summary, profile_data,
  match_alerts_enabled, match_alert_threshold
) on table public.user_master_profiles to authenticated;
grant all on table public.user_master_profiles to service_role;

drop policy if exists "own_profile_read" on public.user_master_profiles;
drop policy if exists "own_profile_insert" on public.user_master_profiles;
drop policy if exists "own_profile_update" on public.user_master_profiles;

create policy "own_profile_read" on public.user_master_profiles
  for select to authenticated
  using (user_id is not null and auth.uid() = user_id);

create policy "own_profile_insert" on public.user_master_profiles
  for insert to authenticated
  with check (user_id is not null and auth.uid() = user_id);

create policy "own_profile_update" on public.user_master_profiles
  for update to authenticated
  using (user_id is not null and auth.uid() = user_id)
  with check (user_id is not null and auth.uid() = user_id);

revoke all on table public.generated_cvs from anon, authenticated;
grant all on table public.generated_cvs to service_role;

create table if not exists public.api_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash, window_start),
  check (char_length(scope) between 3 and 80),
  check (subject_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists api_rate_limits_updated_idx
  on public.api_rate_limits (updated_at);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  current_window timestamptz;
  next_window timestamptz;
  next_count integer;
begin
  if p_scope is null or char_length(p_scope) not between 3 and 80
     or p_subject_hash !~ '^[a-f0-9]{64}$'
     or p_limit is null or p_limit < 1 or p_limit > 10000
     or p_window_seconds is null or p_window_seconds < 10 or p_window_seconds > 2592000 then
    raise exception 'invalid rate limit parameters';
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  next_window := current_window + make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits (
    scope, subject_hash, window_start, request_count, updated_at
  ) values (
    p_scope, p_subject_hash, current_window, 1, v_now
  )
  on conflict (scope, subject_hash, window_start)
  do update set
    request_count = public.api_rate_limits.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into next_count;

  -- Keep only recent windows for this subject; no raw IP or email is stored.
  delete from public.api_rate_limits
  where scope = p_scope
    and subject_hash = p_subject_hash
    and window_start < current_window - interval '7 days';

  allowed := next_count <= p_limit;
  remaining := greatest(0, p_limit - next_count);
  retry_after_seconds := case when allowed then 0 else
    greatest(1, ceil(extract(epoch from (next_window - v_now)))::integer)
  end;
  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

create or replace function public.delete_b2c_user_data(
  p_user_id uuid,
  p_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_profiles integer := 0;
  deleted_cvs integer := 0;
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null then raise exception 'user id is required'; end if;

  delete from public.generated_cvs where user_id = p_user_id;
  get diagnostics deleted_cvs = row_count;

  -- Deleting the profile also cascades its pending/sent match-alert ledger.
  delete from public.user_master_profiles where user_id = p_user_id;
  get diagnostics deleted_profiles = row_count;

  if normalized_email <> '' then
    delete from public.beta_waitlist where lower(email) = normalized_email;
    delete from public.newsletter_subscribers where lower(email) = normalized_email;
  end if;

  return jsonb_build_object(
    'deleted_profiles', deleted_profiles,
    'deleted_generated_cvs', deleted_cvs
  );
end;
$$;

revoke all on function public.delete_b2c_user_data(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_b2c_user_data(uuid, text)
  to service_role;

comment on table public.api_rate_limits is
  'Server-only atomic rate-limit counters. Subjects are salted SHA-256 hashes.';

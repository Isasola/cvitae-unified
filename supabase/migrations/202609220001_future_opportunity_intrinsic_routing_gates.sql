-- Local-only Grand Checkpoint migration. Do not apply independently.
--
-- The former INSERT trigger copied legacy per-source consumer switches into
-- every row. Those switches are configuration evidence, not row truth, so a
-- newly-ingested, otherwise-ready row could be permanently hidden before any
-- consumer evaluated its intrinsic readiness. This trigger only derives
-- deterministic row gates; source capability/restriction remains in the
-- shared effective-policy layer.
create or replace function public.apply_opportunity_source_trust()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_policy public.opportunity_sources%rowtype;
  v_catalog_ready boolean;
  v_matching_ready boolean;
  v_seo_ready boolean;
  v_deadline_text text;
  v_deadline_date date;
  v_deadline_instant timestamptz;
  v_deadline_expired boolean := false;
begin
  insert into public.opportunity_sources (source, display_name, trust_level, auto_verify, is_enabled, notes)
  values (
    coalesce(nullif(trim(new.source), ''), 'unknown'),
    initcap(replace(coalesce(nullif(trim(new.source), ''), 'unknown'), '_', ' ')),
    'review', false, true, 'Fuente detectada automáticamente; requiere configuración.'
  ) on conflict (source) do nothing;

  new.source := coalesce(nullif(trim(new.source), ''), 'unknown');
  select * into source_policy from public.opportunity_sources where source = new.source;
  new.country_code := coalesce(new.country_code, source_policy.country_code);

  if source_policy.trust_level = 'blocked' or source_policy.is_enabled is not true then
    new.verification_status := 'quarantined';
    new.is_active := false;
  elsif new.verification_status = 'pending' and source_policy.auto_verify then
    new.verification_status := 'verified';
    new.verification_score := coalesce(new.verification_score, 85);
    new.verification_reasons := coalesce(nullif(new.verification_reasons, '[]'::jsonb), source_policy.verification_criteria);
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, 'source_policy:' || new.source);
    new.is_active := true;
  elsif new.verification_status <> 'verified' then
    new.is_active := false;
  end if;

  -- Keep this exactly aligned with src/lib/opportunity-truth.ts. Optional
  -- values use `to_jsonb(new)` so a future/legacy schema can omit them
  -- without creating a separate truth engine.
  -- `opportunities.deadline` is TEXT in production. Parse only values that
  -- match a safe shape, and treat malformed/unknown values as non-expired.
  v_deadline_text := nullif(trim(new.deadline), '');
  if v_deadline_text is not null then
    if v_deadline_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      begin
        v_deadline_date := to_date(v_deadline_text, 'YYYY-MM-DD');
        if to_char(v_deadline_date, 'YYYY-MM-DD') = v_deadline_text
           and v_deadline_date < (now() at time zone 'UTC')::date then
          v_deadline_expired := true;
        end if;
      exception when others then
        v_deadline_expired := false;
      end;
    elsif v_deadline_text ~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then
      begin
        v_deadline_instant := v_deadline_text::timestamptz;
        if v_deadline_instant < clock_timestamp() then
          v_deadline_expired := true;
        end if;
      exception when others then
        v_deadline_expired := false;
      end;
    end if;
  end if;
  v_catalog_ready := coalesce(new.is_active, true) is true
    and (nullif(trim(coalesce(new.verification_status, '')), '') is null or new.verification_status = 'verified')
    and new.deleted_at is null and new.archived_at is null
    and not v_deadline_expired
    and nullif(trim(coalesce(new.title, '')), '') is not null
    and nullif(trim(coalesce(new.slug, '')), '') is not null;
  v_matching_ready := v_catalog_ready
    and trim(coalesce(new.title, '')) ~ '\S+\s+\S+'
    and (
      length(trim(coalesce(new.description, ''))) >= 100
      or length(trim(coalesce(to_jsonb(new)->>'requirements', ''))) >= 60
      or coalesce((select count(*) from unnest(coalesce(new.tags, '{}'::text[])) as tag
                   where nullif(trim(tag), '') is not null), 0) >= 2
      or nullif(trim(coalesce(to_jsonb(new)->>'professional_family', '')), '') is not null
    );
  v_seo_ready := v_catalog_ready
    and length(trim(coalesce(new.description, ''))) >= 100
    and nullif(trim(coalesce(new.organization, '')), '') is not null;

  new.catalog_eligible := v_catalog_ready;
  new.match_eligible := v_matching_ready;
  -- Alerts have their own consumer switch and dispatch policy, but their
  -- deterministic row evidence is the current alert-readiness contract.
  new.alerts_eligible := v_matching_ready;
  new.seo_eligible := v_seo_ready;
  return new;
end;
$$;

-- Preserve the existing trigger name and timing. This migration changes no
-- existing opportunity and no source capability/switch.
drop trigger if exists opportunity_source_trust_before_insert on public.opportunities;
create trigger opportunity_source_trust_before_insert
before insert on public.opportunities
for each row execute function public.apply_opportunity_source_trust();

revoke all on function public.apply_opportunity_source_trust() from public, anon, authenticated;

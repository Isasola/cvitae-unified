-- BUG-003: the legacy UNIQUE(user_id, vacancy_id) prevents immutable CV history.
-- This migration removes only the proven obsolete constraint. It does not
-- rewrite or delete CVs and is safe to run repeatedly.

do $$
declare
  legacy_definition text;
begin
  select pg_get_constraintdef(c.oid)
    into legacy_definition
  from pg_constraint c
  where c.conrelid = 'public.generated_cvs'::regclass
    and c.conname = 'generated_cvs_user_vacancy'
    and c.contype = 'u';

  if legacy_definition is null then
    return;
  end if;

  if regexp_replace(lower(legacy_definition), '[[:space:]]+', '', 'g') <> 'unique(user_id,vacancy_id)' then
    raise exception 'Refusing to drop generated_cvs_user_vacancy with unexpected definition: %', legacy_definition;
  end if;

  alter table public.generated_cvs
    drop constraint generated_cvs_user_vacancy;
end;
$$;

-- vacancy_id is NOT NULL in the base schema. create_cv_version also normalizes
-- blank input to base_cv and serializes numbering with an advisory xact lock.
create unique index if not exists generated_cvs_user_vacancy_version_uidx
  on public.generated_cvs (user_id, vacancy_id, version_number);

comment on index public.generated_cvs_user_vacancy_version_uidx is
  'Immutable CV version identity. Replaces obsolete one-CV-per-user/vacancy uniqueness.';

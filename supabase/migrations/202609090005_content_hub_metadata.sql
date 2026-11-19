-- Older production content_hub tables predate fields already present in the
-- unified base schema. Their absence makes the public blog query fail as a
-- whole, even though published articles exist.
alter table public.content_hub
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz;

update public.content_hub
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.content_hub
  alter column updated_at set default now(),
  alter column updated_at set not null;

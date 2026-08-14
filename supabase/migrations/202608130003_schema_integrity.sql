-- Close a historical RLS gap in the source policy control plane.
alter table public.opportunity_sources enable row level security;
revoke all on table public.opportunity_sources from anon, authenticated;
grant all on table public.opportunity_sources to service_role;

comment on table public.opportunity_sources is
  'Private distribution policy for opportunity sources; accessed through protected admin functions.';

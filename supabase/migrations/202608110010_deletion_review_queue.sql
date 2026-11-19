alter table public.opportunities
  add column if not exists deletion_review_status text
    check (deletion_review_status in ('pending', 'approved', 'cancelled')),
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_requested_by text,
  add column if not exists deletion_reviewed_at timestamptz,
  add column if not exists deletion_reviewed_by text;

create index if not exists opportunities_deletion_review_idx
  on public.opportunities (deletion_review_status, deletion_requested_at desc)
  where deletion_review_status = 'pending' and deleted_at is null;

comment on column public.opportunities.deletion_review_status is
  'Two-step soft-deletion workflow. A pending request must be reviewed before deleted_at can be set.';

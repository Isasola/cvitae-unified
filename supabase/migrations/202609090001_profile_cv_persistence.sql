-- Persist the source CV attached to a B2C profile. Files remain private in the
-- existing candidate-cvs bucket and are only exposed through short signed URLs.
alter table public.user_master_profiles
  add column if not exists cv_file_name text,
  add column if not exists cv_storage_path text,
  add column if not exists cv_text text,
  add column if not exists cv_uploaded_at timestamptz;

comment on column public.user_master_profiles.cv_storage_path is
  'Private candidate-cvs object path. Never expose directly to the browser.';
comment on column public.user_master_profiles.cv_text is
  'Extracted source text used for evidence-grounded profile embeddings.';

-- Recover legacy B2B application data where the application still has it.
-- Older rows that never stored the original PDF can recover text for matching,
-- but intentionally do not fabricate a downloadable file.
with latest_application as (
  select distinct on (lower(email))
    lower(email) as normalized_email,
    cv_file_name,
    cv_storage_path,
    cv_text,
    applied_at
  from public.vacancy_applications
  where nullif(trim(email), '') is not null
  order by lower(email), applied_at desc
)
update public.user_master_profiles as profile
set
  cv_file_name = coalesce(profile.cv_file_name, application.cv_file_name),
  cv_storage_path = coalesce(profile.cv_storage_path, application.cv_storage_path),
  cv_text = coalesce(nullif(profile.cv_text, ''), application.cv_text),
  cv_uploaded_at = coalesce(profile.cv_uploaded_at, application.applied_at),
  embedding = case
    when application.cv_text is not null then null
    else profile.embedding
  end,
  updated_at = now()
from latest_application as application
where lower(profile.email) = application.normalized_email
  and (
    application.cv_file_name is not null
    or application.cv_storage_path is not null
    or application.cv_text is not null
  );

-- B2C profile uploads accept PDF and DOCX; the bucket remains private.
update storage.buckets
set
  public = false,
  file_size_limit = 4194304,
  allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
where id = 'candidate-cvs';

-- Browser clients keep read access to their own row through RLS, but CV file
-- metadata and extracted text are written only by service-role endpoints.
grant select on table public.user_master_profiles to authenticated;
grant all on table public.user_master_profiles to service_role;

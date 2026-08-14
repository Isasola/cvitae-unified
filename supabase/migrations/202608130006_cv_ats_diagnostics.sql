-- Persistent, explainable ATS diagnostics and user questions.
-- Raw CV text is intentionally not stored in these tables.

create table if not exists public.cv_ats_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid references public.user_master_profiles(id) on delete set null,
  source_kind text not null,
  source_label text not null,
  source_version_id uuid references public.generated_cvs(id) on delete set null,
  content_hash text not null,
  rubric_version text not null default 'ats-v1',
  overall_score integer not null,
  category_scores jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  quick_wins jsonb not null default '[]'::jsonb,
  keyword_observations jsonb not null default '[]'::jsonb,
  analysis_model text not null,
  created_at timestamptz not null default now(),
  check (source_kind in ('generated_cv', 'uploaded_cv')),
  check (content_hash ~ '^[a-f0-9]{64}$'),
  check (overall_score between 0 and 100),
  check (jsonb_typeof(category_scores) = 'array'),
  check (jsonb_typeof(strengths) = 'array'),
  check (jsonb_typeof(blockers) = 'array'),
  check (jsonb_typeof(quick_wins) = 'array'),
  check (jsonb_typeof(keyword_observations) = 'array'),
  unique (user_id, content_hash, rubric_version)
);

create table if not exists public.cv_ats_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.cv_ats_assessments(id) on delete cascade,
  user_id uuid not null,
  position integer not null,
  priority integer not null default 2,
  category text not null,
  question text not null,
  why_asked text not null,
  suggested_context text,
  status text not null default 'open',
  answer_text text,
  evidence_id uuid references public.cv_evidence_items(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (position between 1 and 8),
  check (priority between 1 and 3),
  check (category in ('identity', 'title', 'summary', 'skill', 'course', 'experience', 'achievement', 'education', 'language', 'contact', 'other')),
  check (status in ('open', 'answered', 'skipped')),
  check (char_length(question) between 10 and 500),
  check (char_length(why_asked) between 5 and 800),
  check (answer_text is null or char_length(answer_text) between 2 and 2000),
  unique (assessment_id, position)
);

create index if not exists cv_ats_assessments_user_created_idx
  on public.cv_ats_assessments (user_id, created_at desc);
create index if not exists cv_ats_questions_user_status_idx
  on public.cv_ats_questions (user_id, status, created_at desc);

alter table public.cv_ats_assessments enable row level security;
alter table public.cv_ats_questions enable row level security;
revoke all on table public.cv_ats_assessments, public.cv_ats_questions from anon, authenticated;
grant all on table public.cv_ats_assessments, public.cv_ats_questions to service_role;

create or replace function public.create_cv_ats_assessment(
  p_user_id uuid,
  p_profile_id uuid,
  p_source_kind text,
  p_source_label text,
  p_source_version_id uuid,
  p_content_hash text,
  p_category_scores jsonb,
  p_strengths jsonb,
  p_blockers jsonb,
  p_quick_wins jsonb,
  p_keyword_observations jsonb,
  p_questions jsonb,
  p_analysis_model text
) returns table(assessment_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  found_id uuid;
  calculated_score integer;
  question_item jsonb;
  question_position integer := 0;
  normalized_category text;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if p_source_kind not in ('generated_cv', 'uploaded_cv') then raise exception 'invalid source kind'; end if;
  if p_content_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid content hash'; end if;
  if jsonb_typeof(coalesce(p_category_scores, '[]'::jsonb)) <> 'array' then raise exception 'invalid category scores'; end if;
  if jsonb_typeof(coalesce(p_questions, '[]'::jsonb)) <> 'array' then raise exception 'invalid questions'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_content_hash, 0));
  select id into found_id
  from public.cv_ats_assessments
  where user_id = p_user_id and content_hash = p_content_hash and rubric_version = 'ats-v1';
  if found_id is not null then
    return query select found_id, false;
    return;
  end if;

  select least(100, greatest(0, coalesce(sum(
    least(20, greatest(0, coalesce((item->>'score')::integer, 0)))
  ), 0)))::integer
  into calculated_score
  from jsonb_array_elements(coalesce(p_category_scores, '[]'::jsonb)) item;

  insert into public.cv_ats_assessments (
    user_id, profile_id, source_kind, source_label, source_version_id, content_hash,
    overall_score, category_scores, strengths, blockers, quick_wins,
    keyword_observations, analysis_model
  ) values (
    p_user_id, p_profile_id, p_source_kind, left(trim(p_source_label), 240),
    p_source_version_id, p_content_hash, calculated_score,
    coalesce(p_category_scores, '[]'::jsonb), coalesce(p_strengths, '[]'::jsonb),
    coalesce(p_blockers, '[]'::jsonb), coalesce(p_quick_wins, '[]'::jsonb),
    coalesce(p_keyword_observations, '[]'::jsonb), left(p_analysis_model, 160)
  ) returning id into found_id;

  for question_item in
    select value from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) with ordinality
    order by ordinality limit 8
  loop
    if length(trim(coalesce(question_item->>'question', ''))) < 10 then continue; end if;
    question_position := question_position + 1;
    normalized_category := coalesce(nullif(question_item->>'category', ''), 'other');
    if normalized_category not in ('identity', 'title', 'summary', 'skill', 'course', 'experience', 'achievement', 'education', 'language', 'contact', 'other') then
      normalized_category := 'other';
    end if;
    insert into public.cv_ats_questions (
      assessment_id, user_id, position, priority, category, question, why_asked, suggested_context
    ) values (
      found_id, p_user_id, question_position,
      least(3, greatest(1, coalesce((question_item->>'priority')::integer, 2))),
      normalized_category,
      left(trim(question_item->>'question'), 500),
      left(coalesce(nullif(trim(question_item->>'whyAsked'), ''), 'Aclara una parte incompleta del CV.'), 800),
      nullif(left(trim(coalesce(question_item->>'suggestedContext', '')), 500), '')
    );
  end loop;

  return query select found_id, true;
end;
$$;

create or replace function public.review_cv_ats_question(
  p_user_id uuid,
  p_question_id uuid,
  p_decision text,
  p_answer text default null
) returns public.cv_ats_questions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  selected_question public.cv_ats_questions;
  normalized_answer text;
  evidence_fingerprint text;
  linked_evidence_id uuid;
begin
  if p_decision not in ('answered', 'skipped') then raise exception 'invalid decision'; end if;
  select * into selected_question
  from public.cv_ats_questions
  where id = p_question_id and user_id = p_user_id
  for update;
  if not found then raise exception 'question not found'; end if;

  if p_decision = 'skipped' then
    update public.cv_ats_questions
    set status = 'skipped', answer_text = null, evidence_id = null,
        answered_at = now(), updated_at = now()
    where id = p_question_id
    returning * into selected_question;
    return selected_question;
  end if;

  normalized_answer := left(regexp_replace(trim(coalesce(p_answer, '')), '\s+', ' ', 'g'), 2000);
  if char_length(normalized_answer) < 2 then raise exception 'answer is required'; end if;
  evidence_fingerprint := encode(digest('ats-question:' || p_question_id::text, 'sha256'), 'hex');

  insert into public.cv_evidence_items (
    user_id, profile_id, fingerprint, category, claim, context,
    source_kind, source_label, status, active, created_at, updated_at
  )
  select p_user_id, assessment.profile_id, evidence_fingerprint,
         selected_question.category, normalized_answer, selected_question.question,
         'manual', 'Respuesta a diagnóstico ATS', 'pending', true, now(), now()
  from public.cv_ats_assessments assessment
  where assessment.id = selected_question.assessment_id
  on conflict (user_id, fingerprint) do update
  set claim = excluded.claim,
      context = excluded.context,
      category = excluded.category,
      status = 'pending',
      confirmed_value = null,
      active = true,
      reviewed_at = null,
      updated_at = now()
  returning id into linked_evidence_id;

  update public.cv_ats_questions
  set status = 'answered', answer_text = normalized_answer,
      evidence_id = linked_evidence_id, answered_at = now(), updated_at = now()
  where id = p_question_id
  returning * into selected_question;
  return selected_question;
end;
$$;

revoke all on function public.create_cv_ats_assessment(uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_cv_ats_assessment(uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text)
  to service_role;
revoke all on function public.review_cv_ats_question(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_cv_ats_question(uuid, uuid, text, text)
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
  deleted_evidence integer := 0;
  deleted_ats_assessments integer := 0;
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null then raise exception 'user id is required'; end if;

  delete from public.cv_ats_assessments where user_id = p_user_id;
  get diagnostics deleted_ats_assessments = row_count;
  delete from public.generated_cvs where user_id = p_user_id;
  get diagnostics deleted_cvs = row_count;
  delete from public.cv_evidence_items where user_id = p_user_id;
  get diagnostics deleted_evidence = row_count;
  delete from public.user_master_profiles where user_id = p_user_id;
  get diagnostics deleted_profiles = row_count;

  if normalized_email <> '' then
    delete from public.beta_waitlist where lower(email) = normalized_email;
    delete from public.newsletter_subscribers where lower(email) = normalized_email;
  end if;

  return jsonb_build_object(
    'deleted_profiles', deleted_profiles,
    'deleted_generated_cvs', deleted_cvs,
    'deleted_evidence', deleted_evidence,
    'deleted_ats_assessments', deleted_ats_assessments
  );
end;
$$;

revoke all on function public.delete_b2c_user_data(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_b2c_user_data(uuid, text)
  to service_role;

comment on table public.cv_ats_assessments is
  'Explainable ATS diagnostics. Stores hashes and structured findings, never raw uploaded CV text.';
comment on table public.cv_ats_questions is
  'Questions raised by a diagnostic. Answers become pending evidence and require explicit confirmation before CV generation.';

-- Production predates parts of the reproducible local base schema. Keep the
-- atomic Admin/factory functions portable across both historical layouts.

alter table public.recruiter_tokens
  add column if not exists updated_at timestamptz not null default now();

do $compatibility$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.opportunity_factory_commit_atomic(text,timestamptz,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,timestamptz)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    $needle$(p_embedding::text)::extensions.vector$needle$,
    $replacement$(jsonb_populate_record(null::public.opportunities, jsonb_build_object('embedding', p_embedding))).embedding$replacement$
  );
  execute v_definition;

  select pg_get_functiondef('public.claim_vacancy_review_batch(text,uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(
    replace(
      v_definition,
      $needle$recruiter_token_id = token_record.id$needle$,
      $replacement$recruiter_token_id::text = token_record.id::text$replacement$
    ),
    $needle$recruiter_token_id = token_record.id::text$needle$,
    $replacement$recruiter_token_id::text = token_record.id::text$replacement$
  );
  execute v_definition;
end;
$compatibility$;

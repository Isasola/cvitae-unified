-- Item 28: preserve the applied transition's safety controls while removing
-- pre-Item-24 per-source switch semantics from onward-distribution actions.
-- LOCAL / UNAPPLIED. This migration intentionally does not rewrite history.
do $item28$
declare
  definition text;
  original_definition text;
  normalized_definition text;
  normalized_legacy_gate text;
  legacy_pattern text := 'if v_organic_seo and not s[.]seo_enabled then raise exception ''organic_seo_forbidden'';[[:space:]]*end if;[[:space:]]*if v_google_jobs and not s[.]google_jobs_distribution_allowed then raise exception ''google_jobs_forbidden'';[[:space:]]*end if;[[:space:]]*if v_third_party and not s[.]third_party_job_distribution_allowed then raise exception ''third_party_distribution_forbidden'';[[:space:]]*end if;';
  legacy_gate text := $legacy$if v_organic_seo and not s.seo_enabled then raise exception 'organic_seo_forbidden'; end if; if v_google_jobs and not s.google_jobs_distribution_allowed then raise exception 'google_jobs_forbidden'; end if; if v_third_party and not s.third_party_job_distribution_allowed then raise exception 'third_party_distribution_forbidden'; end if;$legacy$;
  effective_gate text := $effective$if v_organic_seo and lower(o.source)='himalayas' then raise exception 'organic_seo_forbidden'; end if; if v_google_jobs and lower(o.source)='himalayas' then raise exception 'google_jobs_forbidden'; end if; if v_third_party then raise exception 'third_party_delivery_unavailable'; end if;$effective$;
begin
  select pg_get_functiondef('public.apply_opportunity_automation_transition(text,timestamptz,text,text,text,text,jsonb,jsonb,text,text,text)'::regprocedure)
    into definition;
  original_definition := definition;
  -- Compare the semantic gate after collapsing formatting whitespace, then
  -- replace only the exact gate with a whitespace-tolerant, single-match
  -- pattern. This accepts pg_get_functiondef indentation drift without
  -- broadening the replacement to unrelated function logic.
  normalized_definition := regexp_replace(definition, '[[:space:]]+', ' ', 'g');
  normalized_legacy_gate := regexp_replace(legacy_gate, '[[:space:]]+', ' ', 'g');
  if position(normalized_legacy_gate in normalized_definition) = 0 then
    raise exception 'item28_transition_definition_unexpected';
  end if;
  definition := regexp_replace(definition, legacy_pattern, effective_gate, 1, 1, 'n');
  if definition = original_definition then
    raise exception 'item28_transition_definition_unexpected';
  end if;
  execute definition;
end
$item28$;

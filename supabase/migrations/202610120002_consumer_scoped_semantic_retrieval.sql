-- LOCAL ONLY: semantic top-N must be selected from the requested consumer
-- universe. This prevents inadmissible raw rows from exhausting the vector
-- window before hydration.
create or replace function public.match_consumer_opportunities(
  query_embedding extensions.vector(384),
  match_threshold double precision default 0.10,
  match_count integer default 120,
  consumer text default 'matching'
) returns table(id text, similarity double precision)
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
  if consumer is null or consumer not in ('matching', 'alerts') or match_count is null or match_count < 1 or match_count > 500 or match_threshold is null then
    raise exception 'invalid_matching_retrieval_request';
  end if;

  if consumer = 'matching' then
    return query
      select o.id, 1 - (o.embedding <=> query_embedding)
      from public.opportunity_final_matching_universe u
      join public.opportunities o on o.id = u.id
      where o.embedding is not null
        and 1 - (o.embedding <=> query_embedding) >= match_threshold
      order by o.embedding <=> query_embedding
      limit match_count;
  else
    return query
      select o.id, 1 - (o.embedding <=> query_embedding)
      from public.opportunity_alert_universe u
      join public.opportunities o on o.id = u.id
      where o.embedding is not null
        and 1 - (o.embedding <=> query_embedding) >= match_threshold
      order by o.embedding <=> query_embedding
      limit match_count;
  end if;
end $$;

revoke all on function public.match_consumer_opportunities(extensions.vector,double precision,integer,text) from public,anon,authenticated;
grant execute on function public.match_consumer_opportunities(extensions.vector,double precision,integer,text) to service_role;

comment on function public.match_consumer_opportunities is
  'Returns semantic top-N only from the canonical universe of the requested private consumer.';

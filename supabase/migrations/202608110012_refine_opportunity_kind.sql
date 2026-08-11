update public.opportunities
set opportunity_kind = case
  when lower(coalesce(type, '')) ~ '(beca|scholarship|fellowship|bursary)' then 'beca'
  when lower(coalesce(type, '')) ~ '(pasant|internship)' then 'pasantia'
  when lower(coalesce(type, '')) ~ '(concurso|competition)' then 'concurso'
  when lower(coalesce(type, '')) ~ '(voluntar|volunteer)' then 'voluntariado'
  when lower(coalesce(type, '')) ~ '(curso|course|training)' then 'curso'
  when lower(coalesce(type, '')) ~ '(intercambio|exchange)' then 'intercambio'
  when lower(coalesce(type, '')) ~ '(conferencia|conference|summit)' then 'conferencia'
  when lower(coalesce(type, '')) ~ '(programa|program|programme|capital semilla|grant|funding|oportunidad)' then 'programa'
  else opportunity_kind
end;

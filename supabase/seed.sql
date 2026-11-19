-- Datos exclusivamente ficticios para staging local. Los dominios `.test` no
-- reciben correo y los textos no corresponden a personas o empresas reales.

insert into public.content_hub (
  id, titulo, slug, cuerpo, categoria, tipo, is_active
) values (
  '10000000-0000-0000-0000-000000000001',
  'Cómo explicar mejor tu experiencia sin inventar métricas',
  'staging-explicar-experiencia-sin-inventar',
  'Artículo ficticio utilizado para comprobar el catálogo local del blog.',
  'CV y empleabilidad',
  'blog',
  true
) on conflict (slug) do nothing;

insert into public.user_master_profiles (
  id, user_id, email, full_name, professional_title, summary, profile_data,
  is_subscribed, match_alerts_enabled, match_alert_threshold, is_test
) values (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'candidata.staging@example.test',
  'Ana Ejemplo',
  'Analista de datos junior',
  'Perfil ficticio para validar matching y alertas.',
  '{"habilidades":["Excel","SQL","Power BI"],"seniority":"Junior","location":"Asunción, Paraguay","modality":"Híbrido","career_route":"empleo-local"}'::jsonb,
  false,
  true,
  85,
  true
) on conflict (id) do nothing;

insert into public.recruiter_tokens (
  id, email, company_name, access_token, token_balance, plan_type, is_active,
  verification_status, verification_data, verified_at, verified_by
) values (
  '30000000-0000-0000-0000-000000000001',
  'rrhh.staging@example.test',
  'Empresa Ejemplo Staging',
  'cvitae-local-staging-company',
  100,
  'staging',
  true,
  'verified',
  '{"environment":"local","fictional":true}'::jsonb,
  now(),
  'seed'
) on conflict (id) do nothing;

insert into public.recruiter_vacancies (
  id, title, description, requirements, location, modality, salary_range,
  company, slug, recruiter_token_id, is_active
) values (
  '40000000-0000-0000-0000-000000000001',
  'Analista de datos junior — Staging',
  'Vacante ficticia para validar el flujo B2B local.',
  'Excel, SQL, Power BI y comunicación clara.',
  'Asunción, Paraguay',
  'Híbrido',
  'Dato ficticio',
  'Empresa Ejemplo Staging',
  'analista-datos-staging',
  '30000000-0000-0000-0000-000000000001',
  true
) on conflict (id) do nothing;

insert into public.opportunities (
  id, title, organization, location, modality, type, rubro, description,
  application_url, source, recruiter_vacancy_id, opportunity_kind,
  opportunity_type, country_code, source_authority, original_source_verified,
  verification_status, verification_score, verification_reasons, reviewed_at,
  reviewed_by, is_active
) values (
  'staging-opportunity-0001',
  'Analista de datos junior — Staging',
  'Empresa Ejemplo Staging',
  'Asunción, Paraguay',
  'Híbrido',
  'Tiempo completo',
  'Tecnología y datos',
  'Oportunidad ficticia para verificar catálogo, matching y alertas.',
  'http://127.0.0.1:8888/vacante/analista-datos-staging',
  'recruiter_b2b',
  '40000000-0000-0000-0000-000000000001',
  'empleo',
  'job',
  'PY',
  'original',
  true,
  'verified',
  100,
  '["empresa ficticia verificada en staging"]'::jsonb,
  now(),
  'seed',
  true
) on conflict (id) do nothing;

insert into public.vacancy_applications (
  id, vacancy_id, vacancy_slug, name, email, cv_text, cv_file_name,
  cv_parse_status, cover_letter, ats_score, fit_score, recommendation,
  ai_summary, strengths, key_matches, key_gaps, analyzed_at
) values (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'analista-datos-staging',
  'Ana Ejemplo',
  'candidata.staging@example.test',
  'CV ficticio: experiencia académica con Excel, SQL y Power BI.',
  'ana-ejemplo-staging.pdf',
  'parsed',
  'Postulación ficticia para pruebas locales.',
  78,
  86,
  'Llamar',
  'Perfil ficticio con coincidencias suficientes para validar el ATS.',
  '["SQL","Excel"]'::jsonb,
  '["SQL","Power BI"]'::jsonb,
  '["Experiencia laboral por confirmar"]'::jsonb,
  now()
) on conflict (id) do nothing;

insert into public.skill_dictionary (canonical_name, variants) values
  ('SQL', array['sql','postgresql','mysql']),
  ('Power BI', array['power bi','powerbi','dax']),
  ('Excel', array['excel','microsoft excel','hojas de cálculo'])
on conflict (canonical_name) do nothing;

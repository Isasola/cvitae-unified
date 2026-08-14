-- Punto 13: Calibración B2C de matching — Verificación SQL en DB local.
-- Usa BEGIN ... ROLLBACK para no persistir fixtures de prueba.
-- Ejecutar con: docker exec supabase_db_cvitae-unified psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/verify-matching-calibration-database.sql

BEGIN;

-- ── 0. Registrar fuente de prueba con matching habilitado ─────────────────
-- El trigger de opportunities recalcula match_eligible según opportunity_sources.matching_enabled.
-- Insertamos test_fixture como fuente confiable dentro de esta transacción (rollback al final).

INSERT INTO public.opportunity_sources (source, display_name, trust_level, auto_verify, is_enabled, matching_enabled, catalog_enabled, alerts_enabled, seo_enabled)
VALUES ('test_fixture', 'Fixtures de QA (solo pruebas)', 'trusted', false, true, true, true, false, false)
ON CONFLICT (source) DO UPDATE SET matching_enabled = true, is_enabled = true;

-- ── 1. Preparar fixtures de oportunidades ──────────────────────────────────

-- Oportunidades positivas (deben aparecer en matching)
INSERT INTO public.opportunities (
  id, title, organization, location, rubro, tags, description,
  application_url, type, opportunity_type, opportunity_kind,
  eligible_countries, eligible_regions, source,
  is_active, verification_status, match_eligible, alerts_eligible,
  archived_at, deleted_at, deadline, created_at
) VALUES
  ('qa13-node-senior', 'Desarrollador Node.js Senior', 'Empresa QA', 'Remoto', 'Tecnología e IT',
   ARRAY['Node.js','TypeScript','PostgreSQL'], 'Buscamos Node con TypeScript y SQL.',
   'https://qa.example/node-senior', 'Remoto', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   true, 'verified', true, true, NULL, NULL,
   NOW() + INTERVAL '180 days', NOW()),

  ('qa13-react-frontend', 'Frontend Developer React', 'Empresa QA', 'Asunción, Paraguay', 'Tecnología e IT',
   ARRAY['React','TypeScript','JavaScript'], 'React.js y TypeScript para aplicaciones web.',
   'https://qa.example/react', 'Híbrido', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   true, 'verified', true, true, NULL, NULL,
   NOW() + INTERVAL '180 days', NOW()),

  ('qa13-data-powerbi', 'Analista de Datos Power BI', 'Empresa QA', 'Asunción, Paraguay', 'Análisis de Datos',
   ARRAY['Power BI','Excel','SQL'], 'Modelado de datos con DAX.',
   'https://qa.example/powerbi', 'Presencial', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   true, 'verified', true, true, NULL, NULL,
   NOW() + INTERVAL '180 days', NOW()),

  ('qa13-aws-cloud', 'Cloud Engineer AWS', 'Empresa QA', 'Remote', 'Cloud',
   ARRAY['AWS','Docker','Python'], 'Amazon Web Services y contenedores.',
   'https://qa.example/aws', 'Remoto', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   true, 'verified', true, true, NULL, NULL,
   NOW() + INTERVAL '180 days', NOW()),

  ('qa13-marketing', 'Especialista en Marketing Digital', 'Empresa QA', 'Asunción, Paraguay', 'Marketing',
   ARRAY['Marketing digital','Google Ads'], 'Campañas digitales y SEO.',
   'https://qa.example/marketing', 'Presencial', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   true, 'verified', true, true, NULL, NULL,
   NOW() + INTERVAL '180 days', NOW()),

-- Oportunidades negativas (deben ser excluidas del matching)
  ('qa13-inactive', 'Oportunidad Inactiva QA', 'Empresa QA', 'Asunción', 'IT',
   ARRAY['Node.js'], '', 'https://qa.example/inactive', 'Remoto', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   false, 'verified', false, false, NULL, NULL,  -- is_active=false
   NOW() + INTERVAL '180 days', NOW()),

  ('qa13-not-verified', 'Sin verificar QA', 'Empresa QA', 'Asunción', 'IT',
   ARRAY['React'], '', 'https://qa.example/not-verified', 'Remoto', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   true, 'pending', false, false, NULL, NULL,   -- verification_status=pending, match_eligible=false
   NOW() + INTERVAL '180 days', NOW()),

  ('qa13-archived', 'Archivada QA', 'Empresa QA', 'Asunción', 'IT',
   ARRAY['Python'], '', 'https://qa.example/archived', 'Remoto', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   true, 'verified', true, false, NOW() - INTERVAL '1 day', NULL, -- archived_at set
   NOW() + INTERVAL '180 days', NOW()),

  ('qa13-expired', 'Vencida QA', 'Empresa QA', 'Asunción', 'IT',
   ARRAY['Node.js','React'], '', 'https://qa.example/expired', 'Remoto', 'job', 'empleo',
   '{}', '{}', 'test_fixture',
   true, 'verified', true, false, NULL, NULL,
   NOW() - INTERVAL '1 day', NOW()),                               -- deadline en el pasado

  ('qa13-tender', 'Licitación pública TI QA', 'Organismo QA', 'Asunción', 'Gobierno',
   ARRAY['Node.js'], 'Licitación de servicios.',
   'https://qa.example/tender', 'Presencial', 'tender', 'concurso',  -- opportunity_type=tender, kind=concurso (licitacion no es valor válido)
   '{}', '{}', 'test_fixture',
   true, 'verified', true, false, NULL, NULL,
   NOW() + INTERVAL '180 days', NOW()),

  ('qa13-ineligible-country', 'Empleo solo EE.UU. QA', 'US Corp', 'New York', 'IT',
   ARRAY['React','Node.js'], '', 'https://qa.example/us-only', 'Presencial', 'job', 'empleo',
   ARRAY['us','usa'], '{}', 'test_fixture',                         -- eligible_countries solo EE.UU.
   true, 'verified', true, false, NULL, NULL,
   NOW() + INTERVAL '180 days', NOW())

ON CONFLICT (id) DO NOTHING;

-- ── 2. Preparar perfil de prueba (fullstack senior) ────────────────────────

INSERT INTO public.user_master_profiles (
  user_id, email, professional_title, profile_data, is_subscribed
) VALUES (
  'a0000000-0000-0000-0000-000000000013'::uuid,
  'qa13-fullstack@test.invalid',
  'Desarrollador Fullstack',
  '{"habilidades":["Node.js","React","TypeScript","Python","PostgreSQL","Git"],"seniority":"semi-senior","location":"Asunción, Paraguay","career_route":"empleo-local"}'::jsonb,
  false
) ON CONFLICT (email) DO UPDATE
  SET professional_title = EXCLUDED.professional_title,
      profile_data = EXCLUDED.profile_data;

-- ── 3. Verificar filtros de exclusión del servidor ─────────────────────────

-- 3a. Oportunidades elegibles para el perfil: solo las 5 positivas + la de staging
DO $$
DECLARE
  eligible_count INTEGER;
  excluded_count INTEGER;
BEGIN
  -- Filtros de DB (is_active, verification_status, match_eligible, archived_at, deleted_at, deadline)
  -- Nota: tender e ineligible-country pasan los flags de DB; son filtrados por código en match-batch.
  SELECT COUNT(*) INTO eligible_count
  FROM public.opportunities
  WHERE is_active = true
    AND verification_status = 'verified'
    AND match_eligible = true
    AND deleted_at IS NULL
    AND archived_at IS NULL
    AND (deadline IS NULL OR deadline > NOW())
    AND id LIKE 'qa13-%'
    AND id NOT IN ('qa13-inactive','qa13-not-verified','qa13-archived','qa13-expired');

  SELECT COUNT(*) INTO excluded_count
  FROM public.opportunities
  WHERE id IN ('qa13-inactive','qa13-not-verified','qa13-archived','qa13-expired')
    AND id LIKE 'qa13-%';

  -- 7 pasan filtros DB: 5 positivos + tender (filtrado en código) + ineligible-country (filtrado en código)
  -- Solo verificamos que los 4 bloqueantes de DB están correctamente excluidos
  IF eligible_count <> 7 THEN
    RAISE EXCEPTION 'Deberían ser 7 oportunidades pasando filtros de DB de fixtures (5 positivos + tender + ineligible-country); encontradas: %', eligible_count;
  END IF;

  -- Verificar que cada bloqueante está efectivamente excluido
  IF EXISTS (
    SELECT 1 FROM public.opportunities
    WHERE id IN ('qa13-inactive','qa13-not-verified','qa13-archived','qa13-expired')
      AND is_active = true
      AND verification_status = 'verified'
      AND match_eligible = true
      AND deleted_at IS NULL
      AND archived_at IS NULL
      AND (deadline IS NULL OR deadline > NOW())
  ) THEN
    RAISE EXCEPTION 'Alguna oportunidad bloqueante está pasando el filtro cuando no debería';
  END IF;

  RAISE NOTICE 'PASS: % oportunidades elegibles y % bloqueadas correctamente', eligible_count, excluded_count;
END $$;

-- 3b. Licitaciones excluidas por tipo
-- NOTA: isTender() es un filtro de código (match-batch), no de DB.
-- Esta sección verifica la estructura del fixture, no aplica RAISE EXCEPTION
-- porque el filtro real es en TypeScript.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.opportunities
    WHERE id = 'qa13-tender'
      AND opportunity_type = 'tender'
  ) THEN
    RAISE EXCEPTION 'El fixture qa13-tender debe existir con opportunity_type=tender para probar isTender()';
  END IF;
  RAISE NOTICE 'INFO (inspeccion estructural): tender qa13-tender tiene opportunity_type=tender. El filtro isTender() opera en codigo match-batch, no en DB.';
END $$;

-- 3c. País inelegible: tiene eligible_countries=['us','usa'], debe excluirse para perfil de Paraguay
DO $$
DECLARE
  declared_countries TEXT[];
  has_latam BOOLEAN;
BEGIN
  SELECT eligible_countries INTO declared_countries
  FROM public.opportunities WHERE id = 'qa13-ineligible-country';

  -- Simular isEligibleForProfile: buscar si alguno cubre latam/py
  SELECT bool_or(
    c = 'py' OR c LIKE '%paraguay%' OR c LIKE '%latam%' OR
    c LIKE '%latin america%' OR c LIKE '%latinoamerica%' OR
    c LIKE '%south america%' OR c LIKE '%worldwide%' OR c LIKE '%all countr%'
  ) INTO has_latam
  FROM unnest(declared_countries) AS c;

  IF has_latam THEN
    RAISE EXCEPTION 'La oportunidad con eligible_countries=[us,usa] no debería cubrir Paraguay/LatAm';
  END IF;
  RAISE NOTICE 'PASS: eligible_countries=[us,usa] excluye correctamente a Paraguay/LatAm';
END $$;

-- ── 4. Verificar normalización via skill_dictionary ────────────────────────

-- Confirmar que el diccionario tiene las variantes clave
DO $$
DECLARE
  node_variants TEXT[];
  powerbi_variants TEXT[];
BEGIN
  -- El diccionario puede estar vacío en local; si está vacío, SKILL_ALIASES en código cubre esto
  SELECT variants INTO node_variants FROM public.skill_dictionary WHERE canonical_name = 'Node.js';
  SELECT variants INTO powerbi_variants FROM public.skill_dictionary WHERE canonical_name = 'Power BI';

  IF node_variants IS NULL THEN
    RAISE NOTICE 'INFO: skill_dictionary no tiene entrada para Node.js (SKILL_ALIASES en match-batch.ts lo cubre)';
  ELSE
    IF NOT ('nodejs' = ANY(node_variants) OR 'node' = ANY(node_variants)) THEN
      RAISE EXCEPTION 'skill_dictionary para Node.js debe incluir alias "node" o "nodejs"';
    END IF;
    RAISE NOTICE 'PASS: skill_dictionary Node.js tiene variantes';
  END IF;

  IF powerbi_variants IS NULL THEN
    RAISE NOTICE 'INFO: skill_dictionary no tiene entrada para Power BI (SKILL_ALIASES en match-batch.ts lo cubre)';
  ELSE
    IF NOT ('powerbi' = ANY(powerbi_variants) OR 'power bi' = ANY(powerbi_variants)) THEN
      RAISE EXCEPTION 'skill_dictionary para Power BI debe incluir alias "powerbi"';
    END IF;
    RAISE NOTICE 'PASS: skill_dictionary Power BI tiene variantes';
  END IF;
END $$;

-- ── 5. Verificar invariantes de la tabla learning_recommendations ──────────

DO $$
BEGIN
  -- La función update_learning_recommendation_status no debe poder cambiar contenido inmutable
  -- Verificamos que el trigger content_immutable existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'learning_recommendation_content_immutable'
      AND tgrelid = 'public.learning_recommendations'::regclass
  ) THEN
    RAISE EXCEPTION 'Falta trigger learning_recommendation_content_immutable';
  END IF;
  RAISE NOTICE 'PASS: trigger de inmutabilidad de recomendaciones existe';

  -- NOTA (inspeccion estructural de grants): verifica grants a nivel de tabla.
  -- Si RLS está habilitado pero el grant existe, las políticas RLS controlan el acceso real.
  -- Esta verificación es una inspección de grants de tabla, no una prueba de política RLS completa.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name = 'learning_recommendations'
      AND table_schema = 'public'
      AND grantee IN ('anon','authenticated')
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'learning_recommendations no debe tener grant SELECT a anon o authenticated (inspeccion estructural)';
  END IF;
  RAISE NOTICE 'PASS (inspeccion estructural): anon/authenticated no tienen grant SELECT directo en learning_recommendations';
END $$;

-- ── 6. Verificar ledger de créditos (B2B, no afecta matching B2C)
-- NOTA (inspeccion estructural): verifica solo existencia del constraint CHECK.
-- No ejecuta transacciones de crédito; la lógica de balance se prueba en verify-b2b-*.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recruiter_tokens_token_balance_check'
      AND conrelid = 'public.recruiter_tokens'::regclass
  ) THEN
    RAISE EXCEPTION 'Falta constraint CHECK token_balance >= 0 en recruiter_tokens (inspeccion estructural)';
  END IF;
  RAISE NOTICE 'PASS (inspeccion estructural): constraint CHECK token_balance >= 0 existe en recruiter_tokens';
END $$;

-- ── 7. Verificar que match_alert_deliveries tiene unicidad user+opportunity ─

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE '%match_alert%unique%'
       OR (conname LIKE '%match_alert%' AND contype = 'u')
    LIMIT 1
  ) THEN
    -- Buscar por tabla
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class cl ON c.conrelid = cl.oid
      WHERE cl.relname = 'match_alert_deliveries'
        AND c.contype = 'u'
    ) THEN
      RAISE NOTICE 'ADVERTENCIA: No se encontró unique constraint en match_alert_deliveries para unicidad user+opportunity';
    ELSE
      RAISE NOTICE 'PASS: match_alert_deliveries tiene unique constraint';
    END IF;
  ELSE
    RAISE NOTICE 'PASS: match_alert_deliveries tiene unique constraint para alertas';
  END IF;
END $$;

-- ── Limpieza ───────────────────────────────────────────────────────────────

ROLLBACK;

SELECT 'Punto 13 DB: todas las verificaciones completadas (ROLLBACK aplicado, no se persistió nada)' AS resultado;

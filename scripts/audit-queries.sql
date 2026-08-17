-- ═══════════════════════════════════════════════════════════════════
-- CVitae — Audit Queries
-- Ejecutar en Supabase SQL Editor (producción)
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Verificar los 56 casos con JobPosting inválido ────────────────────────
-- Muestra los type values reales de las oportunidades que se
-- renderizan en /oportunidades/:slug con @type JobPosting
-- (es decir, NOT scholarship/fellowship/grant/research_funding)

SELECT
  id,
  slug,
  title,
  opportunity_type,
  type AS employment_type_raw,
  source,
  verification_status,
  is_active,
  catalog_eligible,
  seo_eligible
FROM opportunities
WHERE
  opportunity_type NOT IN ('scholarship','fellowship','grant','research_funding')
  AND is_active = true
  AND catalog_eligible = true
  AND verification_status = 'verified'
  AND deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT 100;


-- ─── 2. Casos específicos de Search Console ──────────────────────────────────
SELECT
  id, slug, title, type, opportunity_type, source, is_active, seo_eligible
FROM opportunities
WHERE slug IN (
  'atc-caja-mallorquin-20fb59d7',
  'supervisor-comercial-023cf61c',
  'motoboy-o-recolector-f33709b9',
  'analista-de-ti-27464914',
  'auxiliar-de-seguridad-642eaebd',
  'jefe-de-marketing-paraguay-a94bf62b',
  'administrador-de-sucursal-465433fe',
  'auxiliar-de-soporte-ti-75c3ac8b',
  'especialista-en-retencion-de-clientes-b2c-fe72c0f5',
  'motoboy-o-recolector-4256587b'
);


-- ─── 3. Soft 404 caso específico ─────────────────────────────────────────────
SELECT id, slug, title, is_active, catalog_eligible, verification_status, deleted_at
FROM opportunities
WHERE slug = 'global-entrepreneurship-bootcamp-2026-in-amsterdam,-netherlands-65ab8d76';

-- También buscar por content_hub:
SELECT id, slug, titulo, is_active, tipo
FROM content_hub
WHERE slug LIKE '%global-entrepreneurship%';


-- ─── 4. Distribución de valores type en oportunidades activas ────────────────
SELECT
  type AS type_raw,
  COUNT(*) AS count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct
FROM opportunities
WHERE is_active = true AND verification_status = 'verified' AND deleted_at IS NULL
GROUP BY type
ORDER BY count DESC;


-- ─── 5. Security audit — application_url sospechosas ─────────────────────────
SELECT id, title, source, application_url
FROM opportunities
WHERE
  application_url NOT LIKE 'https://%'
  OR application_url LIKE '%javascript:%'
  OR application_url LIKE '%data:%'
  OR application_url LIKE '% %'     -- URLs con espacios
  OR description LIKE '%<script%'
  OR description LIKE '%javascript:%'
LIMIT 100;


-- ─── 6. Slugs con caracteres inseguros (causa de Soft 404 en prerender) ───────
SELECT id, slug, title, source
FROM opportunities
WHERE
  is_active = true
  AND slug ~ '[^a-zA-Z0-9._-]'   -- caracteres fuera del rango seguro
LIMIT 50;


-- ─── 7. SEO eligible pero sin title ──────────────────────────────────────────
SELECT id, slug, title, source, opportunity_type, type
FROM opportunities
WHERE
  seo_eligible = true
  AND (title IS NULL OR trim(title) = '')
LIMIT 50;


-- ─── 8. Empleos ya en producción con tráfico activo ──────────────────────────
SELECT id, slug, title, type, source, updated_at
FROM opportunities
WHERE slug IN (
  'recepcionista-5208d638',
  'coordinador-a-de-eventos-39e57f85',
  'asistente-de-direccion-384a1081',
  'asesor-comercial-91e8cb5a',
  'soldador-a-b035cc36'
);

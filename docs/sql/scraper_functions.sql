-- ══════════════════════════════════════════════════════════════════════
-- SCRAPER FUNCTIONS — correr en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════


-- 1. GROUP BY source server-side (reemplaza el LIMIT 2000 con JS)
--    Retorna: source, total de registros, última vez visto
CREATE OR REPLACE FUNCTION opportunities_by_source()
RETURNS TABLE(source text, total bigint, last_seen timestamptz)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(source, 'unknown') AS source,
    COUNT(*)                     AS total,
    MAX(created_at)              AS last_seen
  FROM opportunities
  GROUP BY COALESCE(source, 'unknown')
  ORDER BY total DESC;
$$;


-- 2. Cuenta duplicados: misma combinación titulo + organization
CREATE OR REPLACE FUNCTION count_duplicate_opportunities()
RETURNS TABLE(duplicate_count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*) - COUNT(DISTINCT (LOWER(title), LOWER(COALESCE(organization, '')))) AS duplicate_count
  FROM opportunities;
$$;


-- 3. Limpieza automática: elimina oportunidades con más de 7 días de antigüedad
--    Llámala con: SELECT cleanup_old_opportunities();
--    O programá un cron job en Supabase con pg_cron (ver más abajo)
CREATE OR REPLACE FUNCTION cleanup_old_opportunities()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM opportunities
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


-- 4. (Opcional) Programar limpieza diaria con pg_cron
--    Requiere que pg_cron esté habilitado en el proyecto Supabase
--    Si no está disponible, corré la función manualmente o desde GitHub Actions
--
-- SELECT cron.schedule(
--   'cleanup-old-opportunities',
--   '0 3 * * *',   -- 03:00 UTC = 23:00 PY (antes del cron de scrapers)
--   'SELECT cleanup_old_opportunities()'
-- );

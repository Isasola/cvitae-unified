-- Keep known inaccessible or incomplete sources from failing the daily job.
-- They remain visible in the admin control center for later repair/review.
update public.scraper_controls
set
  collection_enabled = false,
  paused_reason = case scraper_id
    when 'vc4a_pes_latam' then 'Pausado: el recolector todavía no existe en el repositorio.'
    when 'wwf_paraguay_calls' then 'Pausado: el sitio oficial responde 403 a GitHub Actions.'
    when 'aecid_paraguay_calls' then 'Pausado: el sitio oficial excede el tiempo de conexión desde GitHub Actions.'
  end,
  updated_by = 'migration_202609090002',
  updated_at = now()
where scraper_id in ('vc4a_pes_latam', 'wwf_paraguay_calls', 'aecid_paraguay_calls');

update public.opportunities
set verification_status = 'quarantined',
    verification_score = 0,
    verification_reasons = '["source_url_http_500"]'::jsonb,
    verification_note = 'Validación 2026-08-11: la URL respondió HTTP 500. No se elimina; queda pendiente de nueva comprobación o corrección manual.',
    is_active = false,
    catalog_eligible = false,
    match_eligible = false,
    alerts_eligible = false,
    seo_eligible = false,
    updated_at = now()
where application_url = 'https://remotive.com/remote-jobs/sales/product-sales-specialist-pet-health-cst-timezone-2091072'
  and verification_status <> 'verified';

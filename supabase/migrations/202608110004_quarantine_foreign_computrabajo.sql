-- Keep the Paraguay catalog geographically honest without deleting source data.
UPDATE public.opportunities
SET is_active = false,
    updated_at = now()
WHERE source = 'computrabajo'
  AND is_active = true
  AND lower(coalesce(location, '')) ~
      '(^|[^a-z])(uruguay|argentina|brasil|brazil|bolivia|peru|perú|chile|colombia|méxico|mexico|españa|espana)([^a-z]|$)';

-- Private, server-side daily series for the CVitae operations brief.
-- Dates are grouped in Paraguay time so the admin never mixes UTC days with
-- the local business day. Only the protected admin Function may call it.
CREATE OR REPLACE FUNCTION public.admin_daily_growth(p_days integer DEFAULT 14)
RETURNS TABLE (
  day date,
  user_signups bigint,
  opportunities_added bigint,
  opportunities_verified bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT LEAST(31, GREATEST(2, COALESCE(p_days, 14))) AS days
  ), calendar AS (
    SELECT generate_series(
      (now() AT TIME ZONE 'America/Asuncion')::date - ((SELECT days FROM bounds) - 1),
      (now() AT TIME ZONE 'America/Asuncion')::date,
      interval '1 day'
    )::date AS day
  ), users_by_day AS (
    SELECT (created_at AT TIME ZONE 'America/Asuncion')::date AS day, count(*)::bigint AS total
    FROM public.user_master_profiles
    WHERE NOT COALESCE(is_test, false)
      AND created_at >= (((now() AT TIME ZONE 'America/Asuncion')::date - ((SELECT days FROM bounds) - 1))::timestamp AT TIME ZONE 'America/Asuncion')
    GROUP BY 1
  ), opportunities_by_day AS (
    SELECT (created_at AT TIME ZONE 'America/Asuncion')::date AS day, count(*)::bigint AS total
    FROM public.opportunities
    WHERE created_at >= (((now() AT TIME ZONE 'America/Asuncion')::date - ((SELECT days FROM bounds) - 1))::timestamp AT TIME ZONE 'America/Asuncion')
    GROUP BY 1
  ), verified_by_day AS (
    SELECT (reviewed_at AT TIME ZONE 'America/Asuncion')::date AS day, count(*)::bigint AS total
    FROM public.opportunities
    WHERE verification_status = 'verified'
      AND reviewed_at IS NOT NULL
      AND reviewed_at >= (((now() AT TIME ZONE 'America/Asuncion')::date - ((SELECT days FROM bounds) - 1))::timestamp AT TIME ZONE 'America/Asuncion')
    GROUP BY 1
  )
  SELECT
    calendar.day,
    COALESCE(users_by_day.total, 0),
    COALESCE(opportunities_by_day.total, 0),
    COALESCE(verified_by_day.total, 0)
  FROM calendar
  LEFT JOIN users_by_day USING (day)
  LEFT JOIN opportunities_by_day USING (day)
  LEFT JOIN verified_by_day USING (day)
  ORDER BY calendar.day;
$$;

REVOKE ALL ON FUNCTION public.admin_daily_growth(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_growth(integer) TO service_role;

COMMENT ON FUNCTION public.admin_daily_growth(integer) IS
  'Private daily B2C and opportunity growth series for the protected CVitae admin, grouped in America/Asuncion.';

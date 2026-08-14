BEGIN;

DO $$
DECLARE
  local_day date := (now() AT TIME ZONE 'America/Asuncion')::date;
  before_users bigint;
  before_added bigint;
  after_users bigint;
  after_added bigint;
  series_days integer;
BEGIN
  SELECT user_signups, opportunities_added
    INTO before_users, before_added
  FROM public.admin_daily_growth(14)
  WHERE day = local_day;

  INSERT INTO public.user_master_profiles (id, user_id, email, full_name, is_test, created_at)
  VALUES (gen_random_uuid(), gen_random_uuid(), 'ops-brief-test@cvitae.invalid', 'Ops Brief Test', false, now());

  INSERT INTO public.opportunities (id, title, application_url, source, is_active, created_at)
  VALUES ('ops-brief-test-opportunity', 'Oportunidad de prueba operativa', 'https://example.invalid/ops-brief-test', 'ops_test', false, now());

  SELECT user_signups, opportunities_added
    INTO after_users, after_added
  FROM public.admin_daily_growth(14)
  WHERE day = local_day;

  SELECT count(*) INTO series_days FROM public.admin_daily_growth(14);

  IF after_users <> before_users + 1 THEN
    RAISE EXCEPTION 'La serie no incorporó el usuario real del día';
  END IF;
  IF after_added <> before_added + 1 THEN
    RAISE EXCEPTION 'La serie no incorporó la oportunidad del día';
  END IF;
  IF series_days <> 14 THEN
    RAISE EXCEPTION 'La serie debe devolver exactamente 14 días, devolvió %', series_days;
  END IF;
  IF has_function_privilege('anon', 'public.admin_daily_growth(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon no debe ejecutar admin_daily_growth';
  END IF;
  IF has_function_privilege('authenticated', 'public.admin_daily_growth(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated no debe ejecutar admin_daily_growth';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.admin_daily_growth(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role debe ejecutar admin_daily_growth';
  END IF;
END $$;

SELECT 'admin-operations-database-ok' AS result;

ROLLBACK;

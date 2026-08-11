CREATE OR REPLACE FUNCTION public.enforce_recruiter_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status <> 'verified' THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recruiter_verification_before_write ON public.recruiter_tokens;
CREATE TRIGGER recruiter_verification_before_write
  BEFORE INSERT OR UPDATE ON public.recruiter_tokens
  FOR EACH ROW EXECUTE FUNCTION public.enforce_recruiter_verification();

UPDATE public.recruiter_tokens
SET is_active = false
WHERE verification_status <> 'verified';

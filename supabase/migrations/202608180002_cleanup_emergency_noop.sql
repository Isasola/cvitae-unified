-- Emergency safety override (2026-08-18):
-- The original cleanup_old_opportunities deleted ALL rows older than 7 days with no
-- regard for verification_status, is_active, or expiration. A newly-moderated record
-- was at risk of deletion within days of creation.
--
-- created_at age is NOT expiration. Automatic cleanup is disabled until a
-- deadline-aware retention policy is explicitly designed and authorised.
--
-- The function signature is preserved so GitHub Actions /rest/v1/rpc/cleanup_old_opportunities
-- continues to succeed (HTTP 200) without triggering any data mutation.
--
-- TODO (future): implement retention using reliable semantics —
--   deadline IS NOT NULL AND deadline::timestamptz < now() → archive/expire
--   deadline IS NULL → never infer expiration from created_at alone

CREATE OR REPLACE FUNCTION public.cleanup_old_opportunities()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY INVOKER
AS $$
BEGIN
  -- NO-OP: no deletes, no updates, no archives.
  -- Returns 0 to satisfy callers that read the integer result.
  RETURN 0;
END;
$$;

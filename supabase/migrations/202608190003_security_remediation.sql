-- Security remediation: revoke unnecessary EXECUTE grants on trigger/event-trigger functions.
-- These functions are invoked only by their trigger bindings, never via direct RPC calls.
-- PostgreSQL blocks direct calls to trigger-return functions anyway, but the grants are
-- unnecessary and violate least-privilege. Revoke from PUBLIC, anon, and authenticated.
-- service_role and postgres retain their grants for internal operations.
-- All REVOKEs are idempotent (no-op if already revoked).

REVOKE EXECUTE ON FUNCTION public.apply_opportunity_source_trust() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_recruiter_verification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Revoke anon/authenticated SELECT on avisos_para_linkedin.
-- This view exposes all active opportunities (without catalog_eligible or verification filter)
-- plus all paraguay_opportunities rows. n8n consumes it via service_role — anon SELECT is
-- not needed and is unintentionally permissive.
REVOKE SELECT ON public.avisos_para_linkedin FROM anon, authenticated;

-- Harden search_path on SECURITY DEFINER trigger functions.
-- apply_opportunity_source_trust: all table refs are explicit public.*, trigger vars need no path.
-- enforce_recruiter_verification: no table refs at all — only trigger row variables.
-- Hardening from search_path=public to search_path='' ensures no unqualified name shadowing.
-- rls_auto_enable already uses search_path=pg_catalog — no change needed.
ALTER FUNCTION public.apply_opportunity_source_trust() SET search_path = '';
ALTER FUNCTION public.enforce_recruiter_verification() SET search_path = '';

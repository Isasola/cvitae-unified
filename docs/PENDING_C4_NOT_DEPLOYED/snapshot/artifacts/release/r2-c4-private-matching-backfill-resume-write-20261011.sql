-- WRITE / NOT AUTHORIZED. Controlled recovery template for ONE failed source.
-- Replace all three NULL values only after reviewing the failed batch evidence.
-- This preserves cursor/counters and uses attempts as a compare-and-set guard.
begin;
set local statement_timeout='30s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true) operator_role_context;
select public.resume_private_matching_c4_failed_source(
  null::text,    -- exact bucket_key from STOP_FAILED_SOURCE
  null::integer, -- exact current attempts value
  null::text     -- non-empty operator recovery reason
);
commit;

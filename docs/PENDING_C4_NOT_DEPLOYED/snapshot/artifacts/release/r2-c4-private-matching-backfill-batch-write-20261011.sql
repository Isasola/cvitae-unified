-- WRITE / NOT AUTHORIZED. One invocation = one source page <=100 rows in one transaction.
-- Re-run as a separate transaction only while the result is RUNNING.
-- STOP_FAILED_SOURCE requires the separate, explicit recovery RPC; failed work
-- never advances the cursor or processed counters. STOP_CONTRACT_DIGEST_DRIFT
-- requires operator review and is not cleared by retrying this script.
begin;
set local statement_timeout='60s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true) operator_role_context;
select public.reconcile_private_matching_c4_batch(100);
commit;

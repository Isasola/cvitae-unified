-- WRITE / NOT AUTHORIZED. Run once only after the post-001 READ ONLY preview is accepted.
-- Materializes every current opportunity ID exactly once with its resolved
-- canonical source or an explicit IDENTITY_REVIEW reason. It does not update
-- Opportunity Truth or Universe rows. Review unresolved identity before batches.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true) operator_role_context;
select public.prepare_private_matching_c4_reconciliation();
commit;

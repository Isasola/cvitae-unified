-- WRITE / NOT AUTHORIZED BY DEFAULT.
-- Requires separate approval after the READ_ONLY preview. Replace the marker
-- with denominator.row_digest from that exact preview. The function re-locks
-- and rejects any intervening historical change.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$
begin
  if '__EXPECTED_DIGEST_FROM_PREVIEW__' like '\_\_%' escape '\' then
    raise exception 'replace_expected_digest_from_preview';
  end if;
end $guard$;
select public.reconcile_recruiter_vacancies_r2(8,'__EXPECTED_DIGEST_FROM_PREVIEW__') reconciliation_result;
commit;

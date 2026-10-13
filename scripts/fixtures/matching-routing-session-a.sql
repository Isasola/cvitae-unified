begin;
select routing_epoch from public.matching_retrieval_scheduler_state where singleton for update;
select pg_sleep(0.6);
select public.complete_matching_retrieval_scan(
  '00000000-0000-0000-0000-000000000001', 2, null, null, 'profile', 'policy'
);
select pg_sleep(0.6);
commit;

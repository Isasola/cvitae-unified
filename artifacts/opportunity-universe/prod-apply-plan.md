# Opportunity Universe production release plan

PREFLIGHT=READY_NOT_RUN; PROD_APPLY=NOT_AUTHORIZED; PROD_RUNTIME_VALIDATION=PENDING. No production write or deployment has occurred.

Historical 2026-09-28 baseline only: TOTAL=16,405; first-failure counts 9,272 + 91 + 6,460 + 429 + 153 = 16,405. Remeasure all current values in preflight; these are not desired outcomes.

## Complete staged order

0. READ-ONLY PROD PREFLIGHT — execute preflight-prod.sql in Supabase SQL Editor; inspect all rows, per-source consumer deltas, permission UNKNOWNs, alias conflicts and require reconciliation difference 0.
1. Obtain explicit authorization for PROD database writes and deployments.
2. Apply prod-apply-schema.sql (additive schema, reducer, independent permission truth and operational controls, plus steady-state triggers only). No switch is projected from permission truth and no historical lifecycle repair occurs here.
3. Run scripts/apply_opportunity_universe_prod.ts with page-size <=250. One call/transaction per page; persist local cursor only after success; resume after errors; stop on error.
4. Run verify-universe-prod.sql. REQUIRE EVERY Universe invariant PASS before advancing.
5. Apply prod-apply-retrieval.sql only after stage 4 passes.
6. Deploy Supabase Edge match-batch runtime plus required shared modules.
7. Perform ONE protected Netlify production deploy containing every changed site/function consumer. Preserve the limited deploy: no preview/debug deploy and no second production deploy.
8. Activate/update the GitHub background worker/workflow only after its required authorized commit/push.
9. Run final verify-prod.sql; require every Universe and Retrieval invariant PASS.
10. Run deterministic single-user FULL canary with bounded pages; verify cursor/coverage and no historical alert delivery.
11. Smoke actual Catalog, Sitemap/SEO, Matching, Alerts dry-run/no-send, Admin summary/row diagnostics and background worker consumers.
12. Mark PROD_CONFIRMED/CLOSE only after all DB checks, runtime smoke, canary and no-alert-flood checks pass.

## Release transition guard

prod-apply-schema.sql installs canonical permission truth independently from operator-controlled source switches. Stage 2 is behavior-changing because effective Catalog/Matching/Alerts/SEO states are recalculated from both dimensions; permission UNKNOWN is never written as operational false.
After PROD authorization, do not start Stage 2 until the preflight consumer deltas have been explicitly accepted.
Do not deliberately leave the release stopped between Stage 2 and runtime cutover. Execute schema → bounded reconciliation → verify-universe → Retrieval → runtime deployment as one controlled release session.
Any FAIL stops advancement immediately; do not declare PROD_CONFIRMED.

For later authorized execution Codex first attempts existing non-persistent access: process environment, repo-local authorized environment, existing authenticated Netlify access and existing linked/authenticated Supabase CLI access. Never print credentials; do not ask Isa to edit env files. If blocked, return one exact missing access item.

UNKNOWN permission remains distinct from DENIED. Historical repair is evidence-backed and explicitly apply-gated. Candidate eligibility does not determine row readiness. No destructive drops, fabricated facts, blind activation or unbounded transaction.
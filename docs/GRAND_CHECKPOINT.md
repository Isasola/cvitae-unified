# CVITAE GRAND CHECKPOINT

MASTER PLAN: 67 ITEMS

## CURRENT

- 45 — CLOSED_LOCAL / PROD_VALIDATION_PENDING
- 46 — CLOSED_LOCAL / PROD_VALIDATION_PENDING
- 47 — CLOSED_LOCAL
- 48 — CLOSED_LOCAL
- NEXT: 49 — Final Grand Checkpoint diff review

Operational rule: Items already worked are baseline. Do not reopen them
without concrete regression evidence. Production-pending validations remain
queued for the coordinated deployment phase.

## Item 49 release-safety gate

Before Item 51 applies any migration, Item 50 must capture and verify the
existing production function definitions that migrations replace; the current
definition of `opportunity_source_trust_before_insert`; the existence and
schema of dependent tables/functions; a source-policy snapshot immediately
before mutation; the exact migration order; and the rollback/forward-fix
procedure. This is a gate for Items 50/51, not permission to touch
production.

## Working method

POWER SHELL / OPERATOR
→ collect evidence/data and run focused verification

REASONING
→ identify exact broken/missing cable and define solution

CODEX
→ apply only the bounded change in the worktree

POWER SHELL
→ inspect diff + focused verifier + RC when applicable

CHECKPOINT
→ record honest evidence level and continue

## MASTER CHECKLIST

1. Map real architecture: scraper → extraction → adapter → Sink → DB → Truth → consumers.
2. Separate discovery coverage from processing caps.
3. Prevent partial scans from killing unseen historical rows.
4. Separate rejected / failed / budget_skipped / unchanged / processed semantics.
5. Repair known field-loss cables in critical scraper paths.
6. Canonicalize source aliases through Registry V2 and fail closed for unknown source identity.
7. Separate source permission from row readiness.
8. Create shared Opportunity Truth/readiness for catalog, matching, SEO and JobPosting.
9. Break historical `match_eligible` circularity in intrinsic readiness.
10. Separate matching readiness from alert readiness and preserve independent SEO review state.
11. Separate embedding READY / PENDING / FAILED / NOT_REQUIRED.
12. Build paginated reconciliation with no functional row hard-cap.
13. Add checkpoint/resume/idempotence mechanics.
14. Validate scale mechanics using synthetic 7,000-row fixture.
15. Separate Preview metrics from Apply execution metrics.
16. Implement durable reconciliation job state and Preview → Apply → Resume contract.
17. Separate RUN ACTUAL from ÚLTIMO RUN COMPLETADO in Admin.
18. Make known `scraper_runs.duration_seconds` writers integer-safe.
19. Make telemetry retry independent from maintenance re-execution.
20. Validate the COMPLETE REAL scraper-derived production inventory READ-ONLY until END OF DATA. No arbitrary cap.
21. Reconcile real accounting: global total = canonical per-source total; explained + unexplained = examined; investigate any unknown source/value.
22. Validate real field survival: extracted/adapted/normalized/Sink/persisted evidence for actual source data, preserving UNKNOWN honestly.
23. Validate future ingestion circuit beyond static existence: Sink → factory → readiness → fingerprint/dedupe → embedding requirement → effective consumers.
24. Validate real routing for every applicable row: catalog / matching / SEO / AEO / GEO / alerts / JobPosting / Admin, with explicit reason for denial.
25. Finish Matching V2.1 decision model: Candidate Truth + Opportunity Truth + applicability + eligibility + professional compatibility + hard requirements + evidence + semantic calibration + preferences + confidence + abstention + explanations.
26. Validate Matching adversarially across multiple professional families; prevent semantic similarity from rescuing wrong-profession conflicts.
27. Connect the accepted Matching path to productive B2C consumers; prove it is not merely shadow/test code.
28. Close effective public distribution boundary for catalog and detail pages.
29. Close canonical URL, lifecycle/deadline and public 404/soft-404 behavior.
30. Close sitemap pagination/universe using the same effective truth.
31. Close prerender using the same effective truth.
32. Close generated redirects/canonical route-family consistency.
33. Close factual JobPosting structured data; keep Google Jobs independent and fail-closed.
34. Close SEO on-page quality at scale: title/meta/headings/content/location/org/deadline/internal links.
35. Close AEO factual structure using Opportunity Truth.
36. Close GEO/entity comprehensibility without inventing data.
37. Close Search Demand loop: GSC demand → intent cluster → inventory → proposed content/landing action.
38. Validate crawl/indexation after deploy using real GSC evidence.
39. Measure impressions/clicks/query/page movement after release.
40. Optimize organic entry-page CTA: search visitor → useful opportunity → signup/profile/CV.
41. Review Home / Jobs / Opportunity Detail / career CTAs for cold organic visitors.
42. Close B2C journey: auth → profile/CV → Candidate Truth → matching → opportunity → save/apply → CV adaptation/PDF.
43. Validate Founding Beta / Free experience and ensure monetization gates do not destroy acquisition.
44. Validate retention/return loop for organic users.
45. Close Approval/Admin minimum edit/save/approve/reject/publish workflow with safe field ownership and audit.
46. Close operational Admin global funnel / source funnel / diagnostics / actions / retry / recovery based on real data.
47. Add `WORKING_PRINCIPLES.md` to repo and make AGENTS.md require it.
48. Persist/update this `docs/GRAND_CHECKPOINT.md` in the same Grand Checkpoint commit.
49. Perform final Grand Checkpoint diff review: code + migrations + RLS/grants + env + workflow + redirects + rollback.
50. Verify migration compatibility/order before any production application.
51. Apply explicitly authorized migrations in coordinated order.
52. Make ONE grouped Grand Checkpoint deploy.
53. Verify production: public distribution, Admin, scrapers, reconciliation preview, Matching, sitemap/canonical, telemetry and B2C smoke.
54. Execute real historical backfill/reconciliation only after full read-only preview is reviewed and explicitly authorized.
55. Verify the backfill result and repeat real accounting to ensure no unexplained rows.
56. Observe initial organic-growth signals and fix evidence-based crawl/index/distribution problems.
57. Optimize CTA/onboarding/matching using actual traffic behavior.
58. Define the minimum sellable B2B product.
59. Close company onboarding and organization identity.
60. Close vacancy publication/management.
61. Close candidate/application centralization.
62. Close bulk CV processing.
63. Close filters / ATS / matching / ranking / comparison.
64. Build B2B CTA/funnel: company visitor → value explanation → trial/demo → action.
65. Validate B2B with real companies and measure time saved / ranking usefulness / willingness to use/pay.
66. Connect B2C acquisition + B2B demand + monetization into one measurable growth system.
67. CVitae Growth-Ready stable:
    organic acquisition
    → trustworthy inventory
    → useful intelligence
    → conversion
    → operational control
    → monetization.

Do NOT claim individual items have production validation unless there is
production evidence.

Items 45 and 46: CLOSED_LOCAL / PROD_VALIDATION_PENDING.

Items 47 and 48: CLOSED_LOCAL once these files are created and wired
correctly.

## PRODUCTION VALIDATION QUEUE

The detailed production queue will be finalized during Item 49 using the
actual worktree and evidence before deployment. Production validation remains
required for previously local-only contracts including public distribution,
matching, sitemap/canonical, Admin operations, telemetry/reconciliation and
B2C smoke.

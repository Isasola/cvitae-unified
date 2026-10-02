# Opportunity Universe runtime release manifest

Deployment is planned only; nothing was deployed. Netlify requires exactly ONE protected production deployment for the complete site/function set; no preview/debug deployment.

| Artifact/file | Runtime surface | Deployment mechanism | Dependency | Required prior DB stage | Post-deploy smoke check |
|---|---|---|---|---|---|
| netlify/functions/public-opportunities.ts | Netlify Site / public Catalog | ONE protected Netlify production deploy | Catalog view available | After DB stages 2 and 5 | Read-only response sample/count matches opportunity_catalog_universe. |
| netlify/functions/sitemap.ts | Netlify Site / SEO | Same single Netlify deploy | SEO view available | After DB stages 2 and 5 | Sitemap URLs are members of opportunity_seo_universe; excluded rows absent. |
| netlify/functions/send-high-match-alerts.ts | Netlify scheduled function / Alerts | Same single Netlify deploy | Alert view and Retrieval tables available | After DB stages 2 and 5 | Dry-run/no-send set matches Alert universe; zero historical FULL_BACKFILL delivery. |
| netlify/functions/admin-data.ts + netlify/functions/lib/eight-gates.ts | Netlify Function / Admin API | Same single Netlify deploy | Universe summary and row RPCs available | After DB stage 2 | Summary/row response reconciles and separates permission UNKNOWN from operational disablement. |
| src/components/admin/SourceOperationsView.tsx | Netlify Site / Admin UI | Same single Netlify deploy | Admin API response compatible | After DB stage 2 | UI shows universe counts, routing unresolved, permission unknown and first broken cable. |
| src/lib/opportunity-universe.ts + src/lib/source-permission-truth.ts + src/lib/effective-source-policy.ts + shared/professional-evidence.ts | Netlify bundle and required Supabase Edge shared bundle | Included in the same Netlify deploy and Edge function release as applicable | Matching SQL functions/schema installed | After DB stages 2 and 5 | Consumer-specific smoke and shared contract gates pass. |
| supabase/functions/match-batch/index.ts + required shared modules | Supabase Edge / Matching | Authorized Supabase function deployment | Final matching view and Retrieval schema available | After DB stages 2 and 5 | Safe invocation reads opportunity_final_matching_universe; V2 remains decision authority. |
| scripts/run_matching_retrieval_expansion.ts + .github/workflows/matching-retrieval.yml | GitHub Actions / Background Retrieval | Authorized commit/push, then enable schedule/dispatch | Retrieval schema and secrets already configured | After DB stage 5 | Bounded single-user run reports canonical denominator/cursor; no alert side effect. |

## Post-deploy smoke (read-only; no notifications)

- PUBLIC CATALOG: confirm public-opportunities consumes canonical Catalog view; compare bounded returned IDs/count with `opportunity_catalog_universe`.
- SITEMAP/SEO: confirm sitemap output is sourced from `opportunity_seo_universe`; sampled excluded rows do not appear.
- MATCHING: invoke match-batch safely and confirm canonical final-matching universe hydration with current V2 reranking.
- ALERTS: dry-run/no-send only; compare candidates to `opportunity_alert_universe` and prove no historical FULL_BACKFILL delivery.
- ADMIN: request summary and one bounded row diagnosis; verify first-broken-cable and separate permission UNKNOWN / operator switch state.
- BACKGROUND RETRIEVAL: one deterministic canary worker invocation against canonical denominator; inspect bounded cursor/coverage and no alert side effect.
- Never send real user notifications during validation. PROD_CONFIRMED requires every smoke, verifier and canary check to pass.
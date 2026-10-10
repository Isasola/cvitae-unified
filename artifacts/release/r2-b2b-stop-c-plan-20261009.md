# R2 B2B STOP C package — prepared, not executed

Every step below is a separate operator decision. Schema/data creation does not
grant Web Catalog, Matching, Alerts, SEO, JobPosting or external distribution.

| Order | Artifact | Type | Expected result | STOP condition |
|---|---|---|---|---|
| 1 | `202610090001_controlled_recruiter_producer.sql` | WRITE schema | Controlled executable producer; existing sources delegate to captured definitions; no permission/switch mutation | Any backup/signature error, function-owner/grant drift, or unrelated-source parity difference |
| 2 | `202610090002_recruiter_opportunity_bridge.sql` | WRITE schema/future | Operation key, unique mirror, create/update/close wiring and guarded reconciliation function | Lock/statement timeout, existing duplicate mirror, type/trigger/RLS/grant error, or any partial transaction |
| 3 | `r2-b2b-historical-preview-20261009.sql` | READ_ONLY | Exact denominator 8/6/2, digest, owner/quality/collision reasons and independent gates; no raw CV/private content | Denominator differs, any owner/source/slug/URL conflict, or public permission unexpectedly ALLOWED |
| 4 | `r2-b2b-reconcile-write-20261009.sql` | WRITE data | Exactly 8 mirrors linked; two historical closed rows stay closed; result says publication_authorized=false | Placeholder digest remains, preview changed, processed != 8, or transaction error |
| 5 | `r2-b2b-post-apply-verify-20261009.sql` | READ_ONLY | 8 unique mirrors, 6/2 lifecycle parity, no invented country, exact field survival, closed rows nowhere READY | Any acceptance boolean false; consumer counts are not required to be equal |
| 6 | `r2-b2b-compensate-write-20261009.sql` | WRITE compensation | Removes only the 8 historical bridge mirrors | Future lineage exists, historical candidate count != 8, or scope changed |
| 7 | `r2-b2b-schema-rollback-write-20261009.sql` | WRITE schema rollback | Only before accepted future operations; restores captured functions and removes R2 schema | Any operation row/mirror remains; use a forward fix instead |

Publication proposal is intentionally absent. To authorize a consumer later,
the operator must separately decide and record an `opportunity_source_consumer_permissions`
row and any relevant `opportunity_sources` legal flag. Current before/after remains:

- Catalog: `web_catalog_allowed=false` → unchanged; DENIED.
- Matching/Alerts: no explicit permission row → unchanged; UNKNOWN.
- SEO: `search_engine_indexing_allowed=null` → unchanged; UNKNOWN.
- Google Jobs / third party: `false` → unchanged; DENIED.

No UPDATE that grants those permissions is included in this package.

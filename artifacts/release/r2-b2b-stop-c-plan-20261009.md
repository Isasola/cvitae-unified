# R2 B2B STOP C package — prepared, not executed

Each WRITE below requires its own explicit operator authorization. Inventory
creation never grants Web Catalog, Matching, Alerts, SEO, JobPosting or external
distribution.

| Order | Artifact | Type | Expected result | STOP condition |
|---|---|---|---|---|
| 0 | `scripts/operator/verify-r2-stop-c2-20261010.ps1` | LOCAL READ_ONLY | Focused C2 artifact verifier PASS at reviewed C1 commit `5add212c` | Any assertion or checkpoint mismatch |
| 1 | `r2-b2b-stop-c2-delete-dependencies-readonly-20261010.sql` | PROD READ_ONLY metadata | Actual inbound/outbound FKs, ON DELETE actions and triggers; operations table is expected missing before schema apply | Any unknown dependency, unsafe delete action or unexplained trigger |
| 2 | `r2-b2b-historical-preview-20261009.sql` | PROD READ_ONLY | Exact 8/6/2 denominator; V1 digest; 5 eligible + 3 `OWNER_MISSING`; **zero existing mirrors** | Any count, mirror, gate, collision, permission or digest-contract difference |
| 3 | `202610090001_controlled_recruiter_producer.sql` | PROD WRITE schema — separate authorization | Controlled executable producer; unrelated sources retain captured behavior; no permission/switch mutation | Backup/signature/owner/grant error or unrelated-source parity change |
| 4 | `202610090002_recruiter_opportunity_bridge.sql` | PROD WRITE schema/future — separate authorization | Operation key, unique mirror, future wiring, exact historical-insert lineage and guarded reconciliation RPC | Timeout, duplicate/preexisting mirror, type/trigger/RLS/grant error or partial transaction |
| 5 | Same dependency metadata query | PROD READ_ONLY metadata | All five relations present; post-schema FK/delete/trigger inventory reviewed before any data write | Missing relation or dependency differs from approved review |
| 6 | `r2-b2b-historical-preview-20261009.sql` | PROD READ_ONLY | Same 8/6/2, 5/3, zero mirrors and V1 digest immediately before reconciliation | Any drift; do not reuse an earlier digest |
| 7 | `r2-b2b-reconcile-write-20261009.sql` | PROD WRITE data — separate authorization | Exactly 5 newly inserted mirrors with exact lineage; 3 unresolved preserved; 8 accounted; publication false | Placeholder remains, preview drift, any prior mirror, non-INSERTED lineage or transaction error |
| 8 | `r2-b2b-post-apply-verify-20261009.sql` | PROD READ_ONLY | Five new INSERTED mirrors, full declared-field/source/lifecycle survival, three explained rows | Any acceptance boolean false; independent consumer counts need not match |
| 9 | `r2-b2b-compensate-write-20261009.sql` | PROD WRITE compensation — only if rollback authorized | Deletes only the five newly created historical mirrors proven by lineage + count + digest | UPDATED/ambiguous lineage, digest/count drift or future lineage on a candidate |
| 10 | `r2-b2b-schema-rollback-write-20261009.sql` | PROD WRITE schema rollback — separate authorization | Only after successful compensation and before accepted future operations | Any operation row/mirror remains; use a forward fix |
| 11 | `r2-b2b-finalize-legacy-rpc-write-20261010.sql` | PROD WRITE cutover — later authorization | After all callers use 12 args, legacy 11-arg overload fails closed | Handler not deployed/healthy or any legacy traffic remains |

The three ownerless historical rows are preserved as `HISTORICAL_UNRESOLVED`;
no owner or permission is invented. The compatibility overload derives a stable
fingerprint from the exact normalized legacy request and delegates to the
12-argument authority. It is transitional: it prevents rollout breakage and
duplicate retries, but does not replace a caller-supplied operation identity.

Publication proposal is intentionally absent. Current policy remains unchanged:

- Catalog: `web_catalog_allowed=false` — DENIED.
- Matching/Alerts: no explicit permission row — UNKNOWN.
- SEO: `search_engine_indexing_allowed=null` — UNKNOWN.
- Google Jobs / third party: `false` — DENIED.

No artifact in this package grants those permissions.

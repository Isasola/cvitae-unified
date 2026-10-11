# R2 B2B STOP C package — prepared, not executed

Each WRITE below requires its own explicit operator authorization. Inventory
creation never grants Web Catalog, Matching, Alerts, SEO, JobPosting or external
distribution.

| Order | Artifact | Type | Expected result | STOP condition |
|---|---|---|---|---|
| 0 | `scripts/operator/verify-r2-stop-c1-20261010.ps1` | LOCAL READ_ONLY | Focused artifact verifier PASS at checkpoint `853c9d01` | Any assertion or checkpoint mismatch |
| 1 | `r2-b2b-historical-preview-20261009.sql` | PROD READ_ONLY | Exact 8/6/2 denominator; V1 digest; 5 eligible + 3 `OWNER_MISSING`; no collisions; distribution still not authorized | Any count, gate, collision, permission or digest-contract difference |
| 2 | `202610090001_controlled_recruiter_producer.sql` | PROD WRITE schema | Controlled executable producer; unrelated sources retain captured behavior; no permission/switch mutation | Backup/signature/owner/grant error or unrelated-source parity change |
| 3 | `202610090002_recruiter_opportunity_bridge.sql` | PROD WRITE schema/future | Operation key, unique mirror, future create/update/close wiring, compatibility wrapper and guarded reconciliation RPC | Timeout, duplicate mirror, type/trigger/RLS/grant error or partial transaction |
| 4 | `r2-b2b-historical-preview-20261009.sql` | PROD READ_ONLY | Same 8/6/2, 5/3 and V1 digest immediately before data write | Any drift; do not reuse an earlier digest |
| 5 | `r2-b2b-reconcile-write-20261009.sql` | PROD WRITE data | Exactly 5 eligible mirrors; 3 unresolved rows preserved; result reports 8 accounted and `publication_authorized=false` | Placeholder remains, preview drift, counts differ, or transaction error |
| 6 | `r2-b2b-post-apply-verify-20261009.sql` | PROD READ_ONLY | 5 exact mirrors + 3 diagnosed rows = 8; lifecycle/fields/Universe state valid; no invented country or permission | Any acceptance boolean false; independent consumer counts need not match |
| 7 | `r2-b2b-compensate-write-20261009.sql` | PROD WRITE compensation | Deletes only the exact 5 historical mirrors proven by count + digest | Digest/count drift or future lineage on a candidate |
| 8 | `r2-b2b-schema-rollback-write-20261009.sql` | PROD WRITE schema rollback | Only before accepted future operations; restores captured functions and removes R2 schema | Any operation row/mirror remains; use a forward fix |
| 9 | `r2-b2b-finalize-legacy-rpc-write-20261010.sql` | PROD WRITE cutover | After all callers use 12 args, legacy 11-arg overload fails closed | Handler not deployed/healthy or any legacy traffic remains |

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

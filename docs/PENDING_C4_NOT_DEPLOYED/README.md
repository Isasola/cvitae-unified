# PENDING C4 — reference only, not deployed

This directory is an immutable reference snapshot selected from:

- branch: `checkpoint/r2-c4-beta-wip-20261011`
- commit: `b014b3f278b5b68066170dbab4be5f2ee18a44da`
- production comparison base:
  `ce6dc7aba3dec35c6785fb7100d6125cd0962dab`

It is deliberately outside executable project paths. Nothing here is applied,
imported, built, deployed, or proof of production compatibility.

## C4 state

- Local focused tests were reported PASS at the checkpoint.
- Supabase migrations `202610110001_private_b2c_matching_consumer.sql` and
  `202610110002_recruiter_update_and_seo_plus_request.sql` are **not applied**.
- Private B2C matching changes, historical matching reconciliation, and SEO
  Plus are **not active in production**.
- C3 remains separately `PROD_VALIDATED`; this snapshot does not reopen it.

## Contents

- `snapshot/`: exact tracked blobs selected from `b014b3f2`, retaining their
  original repository-relative paths.
- `C4_TREE_DIFF_REFERENCE_ONLY.patch`: complete tree diff from production
  `ce6dc7a` to C4 checkpoint `b014b3f2`. This is evidence only and must not be
  applied or treated as a safe merge after the production squash.
- `C4_CHANGED_PATHS.txt`: name/status inventory for the same tree comparison.
- `C4_SNAPSHOT_SHA256.txt`: digests of the selected snapshot blobs.

## Selected snapshot contract

The snapshot preserves:

- proposed migrations 001/002;
- read-only preflight and post-apply verification;
- prepared, batched, resumable matching reconciliation operations;
- conditioned rollback reference;
- C4 discriminating verifiers for matching, backfill identity, and RPC ACL.

The full patch retains the remaining code/document delta for review without
mixing it into the production source tree.

## Dependencies before any future activation

1. Rebase/reimplement deliberately on the then-current production tree; never
   blind-merge or apply this patch.
2. Re-run one complete PostgreSQL read-only compatibility preflight for the
   actual target schema, function signatures/OIDs, `public.vector`, operators,
   view dependencies, owners, grants/ACL, RLS, triggers, and foreign keys.
3. Obtain independent authorization for migration 001, migration 002, each
   historical reconciliation write, rollback/compensation, and deployment.
4. Preserve service-role-only matching RPC access, existing owner/OID/defaults
   and view contract; do not expose private matching to `anon`.
5. Prove immutable snapshot membership, canonical source identity, exact
   per-source accounting, idempotent retries, failure recovery without cursor
   advancement, and before/after permission digests.
6. Preserve lifecycle hard barriers, explicit matching restrictions, UNKNOWN
   diagnostics, and independent Catalog/Alerts/SEO/JobPosting/external gates.
7. Validate historical and future paths separately, then perform the real
   private consumer E2E before any production closure claim.

## Hard warning

`LOCAL_PASS != APPLIED != RUNTIME_PASS != PROD_VALIDATED`.

Do not copy files from `snapshot/` into executable paths, run any `*-write-*`
SQL, or use the reference patch without a new explicit user authorization and
review against current production.

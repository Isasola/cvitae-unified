# CVITAE BETA MASTER — 2026-10-11

Portable documentary checkpoint based exactly on production commit
`ce6dc7aba3dec35c6785fb7100d6125cd0962dab`.

State:

`POSTDEPLOY_BASELINE_FROZEN / BUGS_RECORDED / NEXT_PASS_READY`

This package does not claim that the open user journeys are production-
validated. It contains production source plus documentation-only continuity
changes. It does not contain Git metadata, dependencies, builds, credentials,
private user data, or an applied C4 release.

## Start

1. Read `AGENTS.md`.
2. Read `WORKING_PRINCIPLES.md`.
3. Read `docs/GRAND_CHECKPOINT.md`.
4. Read `docs/ANY_LLM_START_HERE.md`.
5. Select the stable IDs in `docs/BUG_REGISTRY.md`.
6. Discuss `docs/BETA_NEXT_PASS.md` before authorizing implementation.

Use `docs/MASTER_1_67_STATUS_INDEX.md` as a conservative locator, then use the
Grand Checkpoint as the detailed authority. No 67/67 claim is made.

## Production and pending C4

- Production: `https://cvitae.lat`, Netlify `cvitae-lata`, branch
  `feature/aws-migration`, commit `ce6dc7a`.
- C3: scoped `PROD_VALIDATED`; do not reopen without regression evidence.
- C4: reference-only at `b014b3f2`; see
  `docs/PENDING_C4_NOT_DEPLOYED/README.md`. Its migrations and behavior are not
  active in production.

## Integrity

- `CHECKPOINT_MANIFEST.json` records versions, boundaries, and important files.
- `SHA256SUMS.txt` contains hashes for every packaged file except itself.
- The ZIP SHA256 is reported separately beside the archive and in the final
  operator handoff.

## NEXT_EXACT_ACTION

Authorize one grouped read-only diagnostic pass for BUG-002 and BUG-003. Find
the exact endpoints and sanitized request/log stages for ATS 502 and rewrite
preparation failure, determine their last common proven gate and first
divergent failure, then propose one coherent implementation. No fix is
authorized by this checkpoint itself.

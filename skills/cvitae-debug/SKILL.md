---
name: cvitae-debug
description: Debug semantic and system truth drift in CVitae across opportunities, candidates, matching, Admin, automation, SEO and data pipelines.
---

# CVitae Semantic Debugging (v1.1)

Read `AGENTS.md`, `WORKING_PRINCIPLES.md` and the current Grand Checkpoint
first. This skill diagnoses truth flow; it grants no production writes,
deploys, migrations, backfills or scoring changes.

For every critical claim make this table:

`CLAIM | QUESTION | UPSTREAM EVIDENCE | PRODUCER BRANCH | EVIDENCE CLASS |
NORMALIZED VALUE | PROVENANCE | CREATE | UPDATE | NO-OP | HISTORICAL |
ENTRYPOINTS | PERSISTENCE | CONSUMERS | INTERPRETATION | FAILURE | RECOVERY |
STATE`.

Use `references/semantic-truth-checklist.md` as the compact working template.

Use `ROW_EXPLICIT`, `SOURCE_CONTRACT_DERIVED`,
`DETERMINISTIC_NORMALIZATION`, `HEURISTIC_INFERRED`,
`FALLBACK_PLACEHOLDER`, `ABSENCE_DERIVED`, `LEGACY_DERIVED`, or `UNKNOWN`.

Actively test: `UNKNOWN_TO_FACT`, `ABSENCE_TO_FACT`, `FALLBACK_AS_FACT`,
`DIMENSION_SWAP`, `SEMANTIC_COMPRESSION`, `OPERATIONAL_AS_FACTUAL`,
`SOURCE_CONTEXT_AS_ROW_FACT`, `CREATE_UPDATE_DRIFT`, `ENTRYPOINT_DRIFT`,
`CONSUMER_DISAGREEMENT`, `PROVENANCE_DROP`, `METADATA_AS_EVIDENCE`, and
`POSITIVE_CLAIM_WITHOUT_PROOF`. A test proves only its exercised branch.

Verification assertions must have discriminating power. Require an expected
positive, expected negative and adversarial branch (plus regression where it
exists); `>= 0`, presence, non-null and merely-returned values prove nothing.
Before changing a shared primitive, map every caller and consumer, then keep
CREATE, UPDATE, NO-OP, HISTORICAL and entrypoint parity explicit. Audit tools
are production code for truth purposes: validate their baselines and failure
paths too.

For external sources, separately record permission truth: collection/detail
fetch, catalog, matching, alerts, SEO/indexing, Google Jobs, third-party
distribution, application routing, attribution and rate-limit evidence.
UNKNOWN permission is not an affirmative grant.

Implement the smallest shared repair only when cause, invariant, persistence
boundary and consumers are known. Otherwise preserve UNKNOWN and report the
evidence required to resolve the contract.

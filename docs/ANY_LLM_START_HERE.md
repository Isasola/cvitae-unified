# CVitae — start here for any LLM or coding agent

This snapshot is a documentary checkpoint based on the exact production tree
`ce6dc7aba3dec35c6785fb7100d6125cd0962dab` from
`feature/aws-migration` on 2026-10-11.

## Read in this order

1. `AGENTS.md`
2. `WORKING_PRINCIPLES.md`
3. `docs/GRAND_CHECKPOINT.md`
4. `docs/BUG_REGISTRY.md`
5. `docs/POST_RELEASE_BACKLOG.md`
6. `docs/SESSION_HANDOFF_2026-10-12.md` (LATEST VERIFIED EVIDENCE)
7. `docs/BETA_NEXT_PASS.md`
7. The relevant skill/source contract only when the task touches that area.

The current user instruction always wins. Do not replace these authorities
with older portable handoffs.

## Current truth

- Production domain: `https://cvitae.lat`.
- Netlify site: `cvitae-lata`.
- Production branch: `feature/aws-migration`.
- Confirmed deployed commit: `ce6dc7a` (PR #4 merged and published).
- SEO/B2C release is deployed; full authentication, candidate, ATS/CV,
  matching, and Admin journeys are not thereby production-validated.
- C3 is `PROD_VALIDATED` for its scoped historical B2B bridge contract. Do not
  reopen without concrete regression evidence.
- C4 checkpoint is `b014b3f2` on
  `checkpoint/r2-c4-beta-wip-20261011`. It is reference-only here: local tests
  passed, migrations `202610110001` and `202610110002` are not applied, and
  its new matching/reconciliation/SEO Plus behavior is not active in PROD.
- The Master 1–67 history remains in `docs/GRAND_CHECKPOINT.md`. No document
  in this package claims 67/67 or globally `PROD_VALIDATED`.
- Historical local evidence that remains relevant is preserved in
  `docs/B2C_READY_CHECKPOINT_R1_2026-10-08.md` and
  `docs/R2_STOP_B_CLOSED_CHECKPOINT_2026-10-10.md`. Older bootstrap/deploy
  handoffs were intentionally not promoted into the current read order.
- At least nine real users exist; restoring useful beta journeys takes
  priority over expanding architecture.

## Current item

`PROD_BASELINE_VERIFIED / P0_EVIDENCE_CONFIRMED / LOCAL_SCRAPER_AND_BETA_PASS_APPROVED / NO_DEPLOY`

The user approved **local implementation scope** for a grouped beta repair and
reinforcing existing scrapers plus adding Greenhouse and Lever. This **does not**
authorize push, deploy, SQL writes, granting source permissions, activating
Catalog/Matching/SEO consumer switches, or touching C4. The local Windows repo
has NOT automatically received this ZIP's new documentary updates.

Resume from `docs/SESSION_HANDOFF_2026-10-12.md` and `docs/BETA_NEXT_PASS.md`.
Already-proven: CV rewrite Bedrock call succeeded but DB uniqueness prevented
version save; default matching computed 0 MATCH on 388 bounded candidates;
Universe reconciliation 16,541 state / 6,224 row-ready / 203 final Matching
(all Himalayas) / 204 Catalog / 6,021 SEO; source switches vs final gaps
are recorded. One 30s Netlify timeout not yet correlated to ATS's function.
Do not ask operator to repeat these reads.

## Do not reopen or assume

- Do not reconstruct R1/R2 closed local contracts without regression evidence.
- Do not reopen C3.
- Do not apply, merge, or partially copy C4 from the reference directory.
- Do not infer production behavior from fixtures, local tests, preview URL
  counts, or code presence.
- Do not attribute HTTP 502 to a vendor without correlated logs.
- Do not fabricate matches, eligibility, geography, remote scope, salary,
  source permission, or search-engine authorization.
- Do not treat Catalog, Matching, Alerts, SEO, JobPosting, Google Jobs, and
  third-party distribution as one gate.
- Do not treat a LIMIT/page/batch as the complete universe.
- Do not store real CVs, emails, tokens, secrets, or personal screenshots in
  checkpoints or prompts.

## Portable snapshot boundaries

- Executable source is production `ce6dc7a` plus documentation-only changes.
- `docs/PENDING_C4_NOT_DEPLOYED/` is evidence, not executable release input.
- The portable ZIP intentionally excludes `.git`, `.env*`, dependencies,
  builds, caches, temporary files, user data, and credentials.
- `CHECKPOINT_MANIFEST.json` records versions and evidence limits.
- `SHA256SUMS.txt` and the external ZIP digest verify integrity.

## Handoff template

Before changing code, report:

```text
CURRENT_BUG_IDS=
REAL_INPUT=
PRODUCER=
LAST_PROVEN_GATE=
FIRST_UNPROVEN_GATE=
DATA_AUTHORITY=
APPLICABLE_DENOMINATOR=
FAILURE_AND_RECOVERY=
MINIMUM_DISCRIMINATING_TESTS=
PROD_DEPENDENCIES=
NEXT_SAFE_ACTION=
```

When finishing, update the same bug IDs with evidence level, fixed SHA, real
E2E result, remaining blocker, and production validation status. Never close a
bug merely because code compiles or a fixture passes.

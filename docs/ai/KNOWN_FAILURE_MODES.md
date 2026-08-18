# CVitae — Known Failure Modes

Format: SYMPTOM → ROOT CAUSE → DO NOT → CORRECT ACTION

---

## NETLIFY DOUBLE DEPLOY
push to feature/aws-migration already triggers production automatically.
DO NOT: `netlify deploy`, `netlify deploy --prod`, `createSiteBuild`, retry after push.
Monitor: read-only API/status commands only.
Root: already happened — produced a canceled/failed Deploy Preview.

## SECRET OUTPUT
DO NOT: `netlify env:list --json`, `netlify env:get KEY` (both print values).
DO NOT ever print: service role key, AWS credentials, API keys, admin passwords.
CORRECT: verify env existence with CLI flags that don't print values; ask user.
Root: SUPABASE_SERVICE_ROLE_KEY was exposed in a previous session.

## LOCAL ≠ PRODUCTION BUILD
`pnpm build` is NOT equivalent to Netlify production build.
Production-context QA: `netlify build --context production`
Root: .env local may point to local services; Netlify injects different env vars.

## PREVIEW/CONFIRM RACE (admin approval)
Preview must pin record IDs. Confirm processes ONLY those IDs.
Backend re-fetches/reclassifies at confirm time.
DO NOT: approve new records that did not appear in the preview set.

## MATCHING ≠ SEO
NEVER gate matching on `seo_eligible`.
They are independent subsystems (see SYSTEM_CONTRACTS.md).
Root: SEO also evaluates quality, but that does not make it a matching precondition.

## CONTENT_HUB CONFUSION
`content_hub` = LEGACY. `opportunities` = current primary table.
DO NOT treat content_hub record counts as total opportunity counts.

## JOBPOSTING ≠ MATCHABLE
`JobPostingDecision=SKIP` does NOT mean not matchable.
`match_eligible=true` records can exist without a complete JobPosting.
Root: two independent decisions from classify.ts.

## SEO OPTIONAL FIELDS
DO NOT invent salary, address, postalCode, deadline, employmentType to remove Google warnings.
Root: `classifyOpportunity()` explicitly forbids fabrication.

## SEARCH CONSOLE ASYNC
Validations are async. Do not re-trigger Validate repeatedly.
A Google wait is not a signal to refactor. Wait for async result.

## SOFT 404
Invalid dynamic slug → real 404. Unknown SPA route → may return 200 (known debt).
DO NOT declare soft 404 resolved without a specific fix for the SPA case.

## PRERENDER
Public SEO pages need real initial HTML. React client rendering alone is insufficient.
Scripts run in Netlify CI only — do NOT run prerender.mjs manually in dev.

## URL LIFECYCLE
archive/delete must: remove from matching+catalog AND fire URL_DELETED to indexing queue.
DO NOT archive without triggering the deindex event.

## DRY RUN
Respect `SEO_DRY_RUN=true` and `SEO_GOOGLE_INDEXING=false` until explicit authorization.
DO NOT claim indexing was tested if an early return prevents execution.

## CLAIM VS PROOF
DO NOT declare PASS based on code appearance alone.
AUTO_APPROVE decision ≠ actual DB publication.
Manual crawler ≠ automatic post-publish QA.
`pnpm build` ≠ Netlify production-context build.
A PASS requires observable evidence.

## SCOPE CREEP
scraper task → do not touch matching (unless proven dependency).
SEO task → do not change publication/matching logic.
UI task → do not change backend semantics.
An audit does not authorize unrelated refactors.
Report out-of-scope problems; do not fix them unless P0.

## GRAPH STALENESS
After significant code changes: run `graphify update .` before querying.
AST graph does not capture DB column semantics — verify with targeted source reads.
Code always wins over graph output.

## STALE COUNTS
DO NOT promote a session snapshot count (active/pending/in_review) to architecture.
Counts are volatile. Query DB for current values. See SESSION_HANDOFF.md for dated snapshots.

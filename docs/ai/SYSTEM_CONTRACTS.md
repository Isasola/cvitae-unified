# CVitae — System Contracts

## Opportunity Pipeline

```
scrapers/                    → opportunity_sink.py (OpportunitySink.upsert)
→ opportunities table        (status: pending / in_review; is_active=false)
→ Admin verification         (verification_status → 'verified'; is_active → true)
→ catalog                    (frontend browsability)
→ matching                   (match-batch Supabase Edge Function)
→ SEO pipeline               (classify.ts → seo-pipeline-runner.ts)
→ Google JobPosting          (classifyOpportunity → JobPostingDecision)
→ indexing-queue.ts          (enqueueIndexingEvent → Google Indexing API)
```

## Matching Gate (match-batch/index.ts — verified from source)

Query filters on `opportunities`:
```
is_active         = true
verification_status = 'verified'
match_eligible    = true
deleted_at        IS NULL
archived_at       IS NULL
deadline          IS NULL OR deadline >= now()
```
Alerts mode adds: `alerts_eligible = true`

**NO** seo_eligible, **NO** catalog_eligible, **NO** jobposting_validity in this query.

## Three Independent Classification Decisions (src/lib/seo/classify.ts)

```typescript
PublicationDecision = 'AUTO_APPROVE' | 'REVIEW' | 'BLOCK'
SeoDecision         = 'ELIGIBLE' | 'REVIEW' | 'EXCLUDE'
JobPostingDecision  = 'EMIT' | 'SKIP'
```

These are evaluated together by `classifyOpportunity()` but are INDEPENDENT.
A record can be: MATCHABLE=YES + SeoDecision=REVIEW + JobPostingDecision=SKIP — no contradiction.

AUTO_APPROVE requires all required fields + no blocking/review conditions.
REVIEW prevents AUTO_APPROVE but allows manual publication.
BLOCK prevents publication entirely.

## Subsystem Separation (critical invariants)

| System | Reads | Does NOT read |
|---|---|---|
| Matching | opportunities (flags above) | content_hub, seo_eligible |
| Catalog | opportunities (is_active, verified) | matching score |
| SEO | classify.ts rules, normalize.ts | match_eligible |
| JobPosting | classify.ts rules | matching eligibility |
| Indexing | indexing-queue.ts, enqueueIndexingEvent | match score |

## Key Files

| File | Role |
|---|---|
| `scrapers/opportunity_sink.py` | Scraper → DB ingestion (OpportunitySink, normalize_opportunity) |
| `scrapers/templates/scraper_template.py` | Base scraper template |
| `supabase/functions/match-batch/index.ts` | Matching entry point (Supabase Edge Function) |
| `supabase/functions/_shared/matching.ts` | Core: rankOpportunities, isEligibleForProfile, calculateSkillScore |
| `src/lib/seo/classify.ts` | Classification engine (PublicationDecision, SeoDecision, JobPostingDecision) |
| `src/lib/seo/eligibility.ts` | SEO eligibility: validateEligibility() |
| `src/lib/seo/flags.ts` | Server-side SEO flags: serverSeoFlags() |
| `netlify/functions/lib/seo-pipeline-runner.ts` | SEO pipeline: runSeoPipeline() |
| `netlify/functions/lib/indexing-queue.ts` | Google indexing: enqueueIndexingEvent() |
| `netlify/functions/admin-data.ts` | Admin CRUD (opportunity lifecycle) |

## Schema Notes

- `opportunities.id` is TEXT (not uuid) — never use gen_random_uuid() for inserts
- `content_hub` is LEGACY — `opportunities` is the primary table
- `match-batch` is a Supabase Edge Function (NOT a Netlify Function)
- `embed-opportunities` processes 50/invocation, invoke repeatedly until `done: true`
- pgvector fallback: if <5 vector results → keyword scoring

## Never Fabricate

`classifyOpportunity()` explicitly never infers: organization, salary, deadline, description.
Do not invent data to satisfy Google JobPosting schema warnings.

# AI call inventory and cost policy

Verified against code on 2026-08-20. Git/code remains authoritative. Every generative call below emits metadata-only `[ai_telemetry]` logs: provider, model, feature, timestamp, trigger/actor, cache hit, request ID, token counts when exposed, duration, status and error class. Prompts, CVs, HTML, emails and model output are not logged.

Permanent order: **deterministic first → Gemini second → Bedrock only when high value**.

| Feature | Endpoint/module | Provider/model | Trigger | Frequency/cache | Decision |
|---|---|---|---|---|---|
| Growth metrics | `admin-analytics` | None | Analytics load/refresh | Reporting APIs; frontend cache | MAKE DETERMINISTIC / KEEP LAZY |
| Growth analysis/questions | `admin-analytics` | Gemini 3.5 Flash Lite | Explicit “Generar análisis IA” or operator question | Frontend TTL cache; never on mount | PREFER GEMINI / MAKE LAZY / ADD CACHE |
| Learning recommendations | `gemini-courses` | Gemini 3.5 Flash Lite | Explicit dashboard or learning-plan refresh | Persisted recommendations + dashboard cache | PREFER GEMINI / MAKE LAZY |
| Review Bot Stage A | `admin-review-bot` | None | Explicit individual/batch review | 30-minute input cache | MAKE DETERMINISTIC |
| Review Bot Stage B | `review-gemini` | Gemini 3.5 Flash Lite | Explicit “Aclarar con Gemini”, only `needsAi=true` | Hash of input/rules/model/prompt, six hours per warm instance | PREFER GEMINI / ADD CACHE |
| Review Bot Stage C | — | Bedrock disabled in V1 | No automatic path | N/A | REVIEW HUMAN BEFORE BEDROCK |
| Public CV analysis | `analyze-cv-public` | Bedrock Claude Haiku 4.5 | User submits CV | Per explicit submission | KEEP BEDROCK; high-value existing flow |
| Candidate CV analysis | `analyze-cv-candidate` | Bedrock Claude Haiku/Sonnet | User/recruiter submits CV | Per explicit submission; can be high in batch | KEEP BEDROCK / MONITOR VOLUME |
| CV Vivo generation | `generate-cv-vivo` | Bedrock Claude Sonnet 4.6 | User clicks generate | Per generation | KEEP BEDROCK |
| ATS workspace | `cv-ats-workspace` | Bedrock Claude Sonnet 4.6 | Explicit diagnostic action; overview is read-only | Results persisted | KEEP BEDROCK |
| CV rewrite workspace | `cv-rewrite-workspace` | Bedrock Claude Sonnet 4.6 | Explicit proposal action; overview is read-only | Proposals persisted | KEEP BEDROCK |
| Application workspace | `application-workspace` | Bedrock Claude Sonnet 4.6 | Explicit preparation action; overview is read-only | Workspaces persisted | KEEP BEDROCK |
| Candidate comparison | `compare-candidates` | Bedrock Claude Sonnet 4.6 | Explicit recruiter action | May make several calls per comparison | KEEP BEDROCK / HIGH COST RISK |
| Vacancy applicant analysis | `analyze-vacancy-applicants` | Bedrock Claude Sonnet 4.6 | Explicit recruiter batch action | Per candidate plus summary, bounded by existing B2B flow | KEEP BEDROCK / HIGH COST RISK |
| SEO field suggestions | `seo-suggestions` | Bedrock Claude Haiku 4.5 | Explicit Admin button and feature flag | Only ambiguous missing fields; DB suggestions persist | KEEP EXISTING / REVIEW GEMINI LATER |
| Matching embedding | `match-batch` | Supabase `gte-small` | Match calculation/cache miss | Recomputed by current matching flow | REVIEW MANUALLY; not changed because matching is frozen |

## Cost invariants

- Opening `/admin`, Analytics, SEO or Customer 360 makes no generative call.
- Analytics data refresh is deterministic; AI analysis is a separate button.
- Dashboard matching may load automatically, but Gemini learning recommendations do not.
- A deterministic Review Bot result uses zero Gemini and zero Bedrock.
- Common ambiguity may use at most Gemini and only after an explicit Admin action.
- Review Bot V1 never calls Bedrock.
- No cron or GitHub workflow generative call was found.
- Existing Bedrock CV/B2B functions were not migrated merely for uniformity.

## Cache identity

Review Bot Gemini cache identity is derived from the opportunity input, deterministic issues/evidence, rules version, provider/model and prompt version. The cache is deliberately process-local in V1: it avoids repeated calls in a warm function without requiring a migration. It is an optimization, not durable product state.

Analytics retains its existing browser TTL cache. Persisted ATS/rewrite/application/learning outputs remain the durable cache for those product flows.


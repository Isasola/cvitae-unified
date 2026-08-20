# Opportunity review operations

## Review Bot V1

Review Bot is read-only. It selects opportunity data, performs bounded public-page checks and returns evidence, recommendation, confidence and suggested channel flags. It never updates `opportunities`, review status, distribution flags, indexing or alerts.

Stage A checks URL safety, DNS target, HTTP status, redirects, final URL, canonical, page kind, structured data, title, organization, deadline/closure, geo evidence, type, source/record authority and exact/normalized/title+organization duplicate signals. Confirmed 404/410, expiry, unsafe URL, closed page, confirmed duplicate and aggregator without verified origin are hard blocks.

Stage B is disabled by default. The Admin may explicitly request Gemini only when Stage A sets `needsAi=true` and has no hard block. Gemini adds an explanation; it cannot erase hard blocks, publish or change flags.

Stage C/Bedrock is not implemented. Ambiguity unresolved by Gemini remains human review.

## Batch approval

The existing source preview is preserved, but approval now requires:

- an exact frozen list of IDs;
- Review Bot evidence for every selected ID;
- explicit catalog/matching/alerts/SEO booleans;
- a human reason;
- an idempotency/snapshot key.

The backend re-fetches rows in `pending`/`in_review` and returns HTTP 409 if the snapshot is stale or contains an unverified origin. Audit events include snapshot ID, recommendation, rules version, flags before and flags after.

## Held findings

- Canonical architecture is unchanged.
- `seo_eligible` is not a consistent hard gate in sitemap/prerender consumers. Enforcing it could remove currently indexable URLs, so it remains documented pending a live impact query and Search Console evidence.
- SEO normalization still converts missing/invalid country to `PY`. Changing prerender/JSON-LD at scale is held. Review Bot instead treats unknown geo as unknown.
- Matching currently recomputes a `gte-small` profile embedding and has permissive geo behavior. It remains unchanged because matching is explicitly frozen; Review Bot never recommends matching for geo unknown.
- Registry/workflow/runtime reconciliation is exposed as one read-only Admin view. It derives the view from the three existing sources and does not introduce a fourth source of truth.

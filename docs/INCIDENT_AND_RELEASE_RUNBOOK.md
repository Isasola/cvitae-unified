# CVitae — Incident & Release Runbook

> Created: 2026-08-19. Production commit: `45377355`.

---

## Severity Levels

| Level | Definition | Response time |
|---|---|---|
| **P0** | Security breach / data loss / privacy incident / core production unusable | Immediate |
| **P1** | Core user workflow materially broken (signup, auth, resume, matching) | Same session |
| **P2** | Important feature degraded but workaround exists | Next session |
| **P3** | Cosmetic / maintenance / non-blocking | Backlog |

---

## Release Flow

### Standard release

1. Code changes on `feature/aws-migration`
2. `pnpm build` — must complete clean
3. `node scripts/prerender.mjs` (with production Supabase vars) — inspect output
4. `node scripts/generate-sitemap.mjs && node scripts/generate-robots.mjs`
5. Graphify update: `graphify update . && graphify label`
6. `git diff --check` — no whitespace errors
7. `git add <specific files>` — never `git add -A` blindly
8. `git commit` with coherent message
9. `git push origin feature/aws-migration`
10. Wait for Netlify Git-triggered deploy (never run `netlify deploy`)
11. Verify deploy state via `netlify api listSiteDeploys` — must be `ready`
12. Production smoke test

### Migration flow

1. Check migration state: `npx supabase migration list`
2. Verify only expected migrations are pending
3. Review SQL: only `ADD COLUMN IF NOT EXISTS`, safe UPDATEs, no destructive DDL
4. Apply: `npx supabase db push`
5. Lint: `npx supabase db lint --linked` — must return no errors
6. Verify DB state for affected rows before proceeding to code push

### NEVER

- `netlify deploy` (any form, including `--dry`)
- `netlify deploy --prod`
- Force push to `main`
- Push to `main` at all (branch: `feature/aws-migration`)
- Skip pre-push validation
- Stage `.env`, credentials, secrets

---

## Email Safety Protocol

Before any email send:

1. Inspect `email_log` for prior sends to this user+template (idempotency_key).
2. Never blindly resend. Use `force=true` only with explicit founder authorization.
3. Suppressions and bounces are respected by Resend — never manually bypass.
4. A failed email must NOT corrupt product state (enrollment, entitlement, lifecycle).
5. `notify-founder-signup.ts` is admin-only — not wired to automatic signup events.
6. `send-founding-email.ts` is admin-only — not called automatically.

---

## Founding Beta Incidents

### Accidental founding offer sent to a user

1. Check `email_log` for `founding_offer_v1` send.
2. Check `founding_beta_enrollments` for unexpected `offered` status.
3. If offer email confirmed sent: contact Resend to check delivery status.
4. If enrollment was accidentally created: assess status. If `offered` and not accepted: no entitlement impact yet. Document and decide with founder whether to honor or explain.
5. Do NOT manually accept on behalf of user.

### Accidental Pro grant

1. Check `founding_beta_enrollments` for `status = active` and `benefit_end`.
2. Check `user_master_profiles.is_subscribed`.
3. Assess: did the user explicitly accept? If yes, honor it.
4. If caused by a bug (e.g., RPC called with wrong user_id): document, assess impact, founder decides.
5. Do NOT downgrade without explicit founder decision.

### Duplicate founding email

1. Check `email_log` — idempotency_key should have prevented the duplicate.
2. If two rows exist with same idempotency_key: partial index failed (P0 investigation).
3. If `force=true` was used: expected behavior. Log the reason.
4. Contact user if confused; do not send a third email to "clarify."

### Gate failure (founding_offer_enabled query error)

The gate is fail-closed. If a DB error occurs, `get_status` returns `ineligible/gate_error`.
Users temporarily see no modal. Not a P1 unless prolonged (>1 session).
Investigate: Supabase connectivity, column existence, RLS policy.

### Founding entitlement expiry issue

On `benefit_end`, expected behavior: `is_subscribed` should become false if entitlement source is founding-only.
If this doesn't happen automatically: manually audit `is_subscribed` vs `benefit_end` for all active enrollments.
Do NOT downgrade without verifying there is no paid subscription also active.

---

## B2B Incidents

- Human decision remains final for all B2B pipeline moves.
- Privacy/data-access incident (prospect data leaked, shared without consent): P0 — escalate immediately.
- Support blocker (prospect cannot use the product after invitation): P1 — investigate workflow.
- Compensation/refund/SLA dispute: requires explicit founder decision before any commitment.
- Never contact a B2B lead without explicit founder authorization.

---

## Rollback Principles

1. Code rollback: `git revert <commit>` then push. Netlify redeploys automatically.
2. Never `git reset --hard` on a pushed branch without explicit authorization.
3. Migration rollback: Supabase does NOT auto-rollback. Write a forward-only corrective migration if needed.
4. `ADD COLUMN IF NOT EXISTS` with safe defaults is safe to re-apply (idempotent).
5. `UPDATE` rows: verify current state before writing a corrective update.
6. Test on local or staging before applying any corrective migration to production.

---

## P0 Response Checklist

- [ ] Identify scope (which users, which data, which function)
- [ ] Contain: disable the affected endpoint or gate if possible
- [ ] Preserve evidence: do not overwrite logs before reading them
- [ ] Notify founder immediately
- [ ] Document in session notes / handoff doc
- [ ] Do not communicate externally to users before founder decision

---

## Tech Debt / Known Non-Blockers (P2-P3)

**P2:** `/empleos/:slug` and `/oportunidades/:slug` are both self-canonical for job opportunities.
Canonical/indexation architecture review needed to choose a single canonical URL per job.

**P2:** Prerender JobPosting geography emits `addressCountry: PY` when `job.city` is present.
Verify later that city-country mapping cannot misclassify international cities.

**P2:** `mark_offered` action exists but is never called by the frontend.
`founding_offer_v1` email and founder notification are not automatically sent.
Wire in a future session after observing Rosarito's real experiment outcome.

**P3:** Admin SEO endpoint had a pre-existing 502/timeout during validation session.
Not investigated; does not affect production B2C or B2B flows.

# Session Handoff — Founding Beta Launch — 2026-08-19

> Production commit: `45377355`
> Branch: `feature/aws-migration`
> Status: PRODUCTION_HEALTHY = YES, ROSARITO_FIRST_EXPERIMENT_READY = YES

---

## What Was Built This Session

1. **Founding Beta Operating System** (commit `02d2858a`) — full infrastructure:
   - New tables: `founding_beta_enrollments`, `user_events`, `email_log`, `b2c_acquisition`
   - New columns on `user_master_profiles`: `lifecycle_state`, `ttfv_seconds`, `first_value_event`
   - RPC functions: `accept_founding_beta`, `mark_founding_beta_offered` (SECURITY DEFINER)
   - Netlify functions: `founding-beta-action`, `log-user-event`, `send-founding-email`, `notify-founder-signup`
   - Frontend: `useFoundingBeta` hook, `FoundingBetaModal`, Customer 360 drawer, Admin KPIs
   - B2B: 5 survey leads imported to `b2b_prospects`, founding columns added
   - Email system: Resend integration, `lib/founding-mailer.ts`, idempotency via `email_log`

2. **Resend dependency fix** (commit `984a0a4f`) — `resend@6.20.0` added to `package.json`.

3. **Founding rollout gate + deep link fix** (commit `45377355`):
   - `founding_offer_enabled boolean DEFAULT true` on `user_master_profiles` (migration 014)
   - Marcelo deferred (`founding_offer_enabled = false`) via migration
   - Gate wired in `founding-beta-action.ts`: all 3 actions fail-closed on gate query error
   - Admin Customer 360: ELIGIBLE/ENABLED vs ELIGIBLE·DEFERRED badge + "Habilitar Founding →" button
   - Jobs prerendered under `/oportunidades/:slug` (mirrors `/empleos/:slug`) — deep links now resolve 200
   - jobLocation only emitted in JSON-LD when `job.city` is present

---

## Migrations Applied (Production)

| Migration | Status |
|---|---|
| 202608190010_founding_beta.sql | Applied |
| 202608190011_user_intelligence.sql | Applied |
| 202608190012_b2b_founding_and_lifecycle.sql | Applied |
| 202608190013_entitlement_and_idempotency.sql | Applied |
| 202608190014_founding_rollout_gate.sql | Applied 2026-08-19T23:xx |

---

## Current Production State

### B2C Users

| User | is_test | founding_offer_enabled | enrollment | plan |
|---|---|---|---|---|
| Rosarito Godoy | false | **true** | 0 enrollments | FREE |
| Marcelo Vázquez | false | **false** | 0 enrollments | FREE |
| 6 test accounts | true | true | 0 | — |

### B2B

| Metric | Value |
|---|---|
| Real survey leads | 5 |
| Active pilots | 0 |
| Emails sent | 0 |

---

## Email Automation — Critical Gaps

> **DO NOT ASSUME AUTOMATIC EMAIL DELIVERY.**

`mark_offered` is never called by the frontend (`useFoundingBeta` hook only calls `get_status`, `accept`, `increment_dismissed`).

| Email | Trigger | Status |
|---|---|---|
| `founding_offer_v1` | `mark_offered` → first modal show | **NOT AUTO** — mark_offered not wired |
| Founder notification (offer) | `mark_offered` → first modal show | **NOT AUTO** |
| `founding_welcome_v1` | On acceptance | **NOT WIRED** — accept action sends no email |

Both `send-founding-email.ts` and `notify-founder-signup.ts` are admin-only endpoints for manual sends.

Rosarito's next genuine login will trigger the modal (via `get_status` → enrollment=null → showModal=true), but NO email will be sent automatically unless `mark_offered` is wired in a future session.

---

## Opportunity Routing (Deep Links)

```
Prerender generates:
  dist/empleos/{slug}/index.html     ← canonical for jobs-only /empleos facet
  dist/oportunidades/{slug}/index.html ← canonical for main catalog route (ALL types)

netlify.toml:
  /oportunidades/:slug → 404.html (fires only when no static file exists = real 404)
  /empleos/:slug       → 404.html (same)
  /* → /index.html 200 (SPA fallback for auth routes only)
```

- Known slugs → HTTP 200, full content
- Unknown slugs → HTTP 404 (real, not soft)
- No `/* → /index.html` catch-all for opportunity routes

---

## What NOT to Change Before Real User Signals

> **DO NOT ADD MORE INFRASTRUCTURE BEFORE REAL USER SIGNALS.**

- Do not wire `mark_offered` to the frontend yet — observe Rosarito first
- Do not add new Founding email templates
- Do not change pricing UI (pending Moonshot Paraguay intel)
- Do not activate B2B Wave #1 until founder decides
- Do not touch `ADMIN_PASSWORD`, Supabase RLS, or production data directly
- Do not enable Marcelo's founding offer yet (wait ~24-48h after Rosarito experiment)

---

## Next Decision Points

1. **Observe Rosarito** — her next genuine login triggers the Founding modal. Watch:
   - Does she see the modal?
   - Does she accept or dismiss?
   - TTFV / activation event?

2. **Enable Marcelo** — after 24-48h observation of Rosarito:
   - Admin → Customer 360 → Marcelo → "Habilitar Founding →" → Confirm
   - Does NOT send email; modal shows on his next login

3. **Wire mark_offered** — after both real users have engaged:
   - Connect `mark_offered` call to the `showModal` trigger in `useFoundingBeta`
   - This will enable `founding_offer_v1` email and founder notification

4. **Wire founding_welcome_v1** — after first acceptance:
   - Add `sendFoundingEmail({ template: 'founding_welcome_v1', ... })` to `accept` action

5. **B2B Wave #1** — founder chooses 1-2 companies from the 5 survey leads when ready

6. **Canonical SEO audit** — decide single canonical URL per job (`/oportunidades/` vs `/empleos/`)

---

## Key Files

| File | Purpose |
|---|---|
| `netlify/functions/founding-beta-action.ts` | All founding B2C actions (gated, fail-closed) |
| `netlify/functions/lib/founding-mailer.ts` | Shared email logic (templates, Resend, email_log) |
| `netlify/functions/admin-data.ts` | Admin API including user_detail, enable_founding_offer |
| `src/hooks/useFoundingBeta.ts` | Frontend founding state (get_status, accept, dismiss) |
| `src/components/cvitae/FoundingBetaModal.tsx` | Modal UI (accept / ahora no / prefiero no) |
| `src/components/admin/UserDetailDrawer.tsx` | Customer 360 with founding badge + enable button |
| `scripts/prerender.mjs` | Static page generation (jobs mirrored to /oportunidades/) |
| `supabase/migrations/202608190014_founding_rollout_gate.sql` | Gate column + Marcelo deferred |
| `docs/PRODUCT_OPERATING_MODEL.md` | Founding lifecycle, user lifecycle, North Star |
| `docs/ADMIN_DATA_DICTIONARY.md` | All admin actions and field semantics |
| `docs/INCIDENT_AND_RELEASE_RUNBOOK.md` | P0-P3 classification, release flow, email safety |

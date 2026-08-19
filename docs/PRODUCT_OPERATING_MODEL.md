# CVitae — Product Operating Model

> Reference: Founding Beta Operating System (2026-08-19)

---

## 1. B2C Founding Beta Program

**Limit:** 50 users total (hard cap enforced in `accept_founding_beta` SQL function).

**Benefit:** 6 months Pro access — free, no credit card, no auto-renewal.

### Offer flow

1. Backend calls `mark_founding_beta_offered(user_id, email, offer_version)` — sets status to `offered`, records `offered_at`.
2. Frontend shows `FoundingBetaModal` via `useFoundingBeta` hook.
3. User chooses one of three paths:

| Action | Label (UI) | Effect |
|---|---|---|
| Accept | "Quiero ser Founding Member" | Calls `founding-beta-action` → `accept` → status: `accepted` → `active` |
| Dismiss | "Ahora no" | Increments `dismissed_count` only. Status unchanged. Modal re-shown next login. |
| Decline | "Prefiero no participar" | Sets `localStorage` flag only (V1). No DB status change. |

### Status lifecycle

```
eligible → offered → accepted → active → completed
                              ↘ declined (localStorage only, V1)
```

`eligible` = user qualifies but offer not yet shown.
`offered` = modal has been displayed at least once.
`accepted` = user clicked accept (may be transitional).
`active` = benefit is live (benefit_start / benefit_end populated).
`completed` = benefit period ended.
`declined` = permanent opt-out (V1: localStorage flag, not a DB terminal state).

### Netlify function

`/.netlify/functions/founding-beta-action`
Actions: `get_status` / `accept` / `mark_offered` / `increment_dismissed`
Auth: requires valid Supabase JWT.

---

## 2. User Lifecycle States

Stored in `user_master_profiles.lifecycle_state`.

```
signed_up → activated → engaged → churned
```

| State | Trigger |
|---|---|
| `signed_up` | Account created (default) |
| `activated` | First value event logged (see below) |
| `engaged` | Sustained activity (future logic) |
| `churned` | Inactivity threshold (future logic) |

### First value events

Any of these events in `user_events` triggers the `activated` transition:
- `cv_generated`
- `ats_completed`
- `cv_rewritten`
- `workspace_created`

The `log-user-event` Netlify function writes to `user_events` and updates `lifecycle_state` when an activation event is detected.

### Important: denormalization rule

`lifecycle_state` on `user_master_profiles` is a **denormalized cache** — optimized for fast queries.

**Source of truth: `user_events` table.**

Never treat `lifecycle_state` as canonical for audit or billing decisions. Always verify against `user_events` when exactness matters.

---

## 3. Email System

**Provider:** Resend.

**Send function:** `/.netlify/functions/send-founding-email` (admin-only).

**Parameters:** `{ template, user_id, recipient_email, recipient_name, force? }`

**Available templates:**
- `founding_welcome_v1` — Welcome email after activation
- `founding_offer_v1` — Founding Beta offer email

### Dedup rules

1. Before every send, query `email_log` for `(user_id, template)`.
2. If a record exists, skip (return early, do not send duplicate).
3. The `email_log` table has **no UNIQUE constraint on (user_id, template)** — template-level dedup is enforced at application layer only.
4. Never add a UNIQUE constraint on `(user_id, template)` — this would break retry logic for failed sends.
5. **idempotency_key** (added 2026-08-19): a unique partial index (`email_log_idempotency_key_idx`) enforces DB-layer protection against duplicate sends with the same key. Pattern: `<template>:<user_id>:<version>`. NULL = no dedup required.

**`force=true` parameter:** bypasses dedup check. **Never use without explicit authorization.**

### Log schema

All sends (success and failure) are written to `public.email_log`:
- `status`: `sent` / `failed` / `bounced`
- `resend_id`: Resend's message ID (for tracing)

---

## 4. B2B Founding Companies Program

**Limit:** 10 companies (manual tracking).

**Table:** `public.b2b_prospects` with `founding_company = true`.

### Survey companies imported (2026-08-19)

5 B2B survey leads imported 2026-08-19. All records are live in `b2b_prospects`.

| Company | b2b_funnel_status | founding_company | pilot_consent |
|---|---|---|---|
| IMUT | interested | true | true |
| Quality Travel | interested | true | true |
| Manantial S.R.L. | interested | true | true |
| Vitalmed SA | interested | true | true |
| Grupo Dicsa S.A. | interested | true | true |

No further import action required. To invite a company, use `send-b2b-invite` from the admin panel with the prospect's `id`.

### New B2B funnel columns on `b2b_prospects`

| Column | Purpose |
|---|---|
| `pilot_interest` | Boolean — expressed interest in pilot |
| `survey_source` | Where the survey lead came from |
| `survey_date` | Date survey was completed |
| `b2b_funnel_status` | CRM stage (free text) |
| `founding_company` | Boolean — part of Founding Companies program |
| `next_action` | Next step for this prospect |
| `last_contact_at` | Timestamp of last outreach |

---

## 5. Test Data Protection

### PROTECTED_REAL_USERS

Defined in `netlify/functions/admin-data.ts`. Contains two real users whose `is_test` flag must never be flipped accidentally:

| Name | profile_id | auth_id |
|---|---|---|
| Rosarito Godoy | e49a4c2b-8a7e-4d60-845b-c383472012a3 | d5892885-2337-4437-a98b-2f8e2878ddca |
| Marcelo Vázquez | cff71c8d-8de9-487e-af01-57cbe53390f3 | 49ae16ef-2680-4cb2-a709-1deab4a328f3 |

### Safe usage

**Always use `execute_mark_test`** (not `toggle_test`) from the admin UI. The `execute_mark_test` action enforces the `PROTECTED_REAL_USERS` guard and returns a 403 if the target is a protected user.

`preview_mark_test` shows what would happen before committing — use it to confirm intent.

**Never bypass the guard by writing directly to the DB** for these users without explicit authorization.

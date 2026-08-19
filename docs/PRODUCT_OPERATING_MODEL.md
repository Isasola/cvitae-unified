# CVitae — Product Operating Model

> Last updated: 2026-08-19. Production commit: `45377355`.
> Reference: Founding Beta Operating System session.

---

## 1. B2C Founding Beta Program

**Limit:** 50 users total (hard cap enforced in `accept_founding_beta` SQL function).

**Benefit:** 6 months Pro access — free, no credit card, no auto-renewal.

### Sequential Rollout Gate

`user_master_profiles.founding_offer_enabled boolean DEFAULT true`.

| Value | Meaning | Admin badge |
|---|---|---|
| `true` (default) | Normal Founding flow — modal eligible on next login | ELIGIBLE / ENABLED |
| `false` | Deferred — offer suppressed at all three gate points | ELIGIBLE · DEFERRED |

Gate is **fail-closed**: any DB error on the gate query = ineligible. Admin can enable via Customer 360 "Habilitar Founding →" button (requires confirmation). Enabling alone does NOT send any email or grant Pro — it merely allows the next genuine login to trigger the offer flow.

Current experiment users (2026-08-19):
- **Rosarito Godoy** — gate=true, experiment user #1
- **Marcelo Vázquez** — gate=false, experiment user #2 (deferred ~24-48h)

Future genuine new B2C users: `DEFAULT true` — unaffected, normal auto-flow preserved.

### Offer flow (V1)

1. User loads Dashboard → `useFoundingBeta` hook calls `get_status` (with JWT).
2. If `ineligible` → modal suppressed, dismissed flag set in React state.
3. If eligible and `enrollment === null` → `showModal = true` → `FoundingBetaModal` renders.
4. User chooses:

| Action | Label (UI) | Effect |
|---|---|---|
| Accept | "Quiero ser Founding User" | Calls `founding-beta-action` → `accept` → `accept_founding_beta` RPC → enrollment created, Pro granted |
| Dismiss | "Ahora no" | `increment_dismissed` called (fire-and-forget). `dismissed_count` incremented. Modal re-shown next session. |
| Decline | "Prefiero no participar" | `localStorage['founding_beta_declined'] = '1'`. No DB change. Permanent for that browser. |

### Automation gaps (V1 — as of 2026-08-19)

> ⚠️ **CRITICAL: The following are NOT automatically triggered:**
> - `founding_offer_v1` email — `mark_offered` is never called by the frontend
> - Founder notification on offer — also tied to `mark_offered`
> - `founding_welcome_v1` email — not sent on acceptance
>
> All three require manual admin send via `send-founding-email.ts` / `notify-founder-signup.ts`.
> Do NOT assume automatic email delivery for existing or new users until this is wired.

`mark_offered` action exists on the backend but has no frontend caller. Status `offered` is never set by the auto-flow.

### Founding status lifecycle

```
(none) → [modal shown] → accepted → active → completed
                                   ↘ (localStorage decline only, V1)
```

Status `offered` is a defined DB state but not currently reached via the auto-flow.

`active` = benefit live (benefit_start / benefit_end populated, is_subscribed=true via entitlement).
`completed` = benefit period ended (downgrade behavior: TBD).

### Netlify function

`/.netlify/functions/founding-beta-action`
Actions: `get_status` / `accept` / `mark_offered` / `increment_dismissed`
Auth: requires valid Supabase JWT.
Gate: `founding_offer_enabled` checked separately (fail-closed) after `is_test` check.

---

## 2. User Lifecycle States

Stored in `user_master_profiles.lifecycle_state`.

```
signed_up → activated → engaged → churned
```

| State | Trigger |
|---|---|
| `signed_up` | Account created (default) |
| `activated` | First meaningful useful outcome (see below) |
| `engaged` | Sustained activity (future logic) |
| `churned` | Inactivity threshold (future logic) |

**Activation is NOT login, pageview, or profile creation.** Activation = first useful outcome:
- `cv_generated`
- `ats_completed`
- `cv_rewritten`
- `workspace_created`

The `log-user-event` Netlify function writes to `user_events` and updates `lifecycle_state` when an activation event is detected.

**North Star metric:** Weekly Activated Users.
**Core activation metric:** TTFV (Time To First Value) = signup or first relevant session → first useful result.

### Denormalization rule

`lifecycle_state` on `user_master_profiles` is a **denormalized cache** — optimized for fast queries.
**Source of truth: `user_events` table.** Never use `lifecycle_state` for billing or audit decisions.

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

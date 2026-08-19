# CVitae Admin — Data Dictionary

> Last updated: 2026-08-19. Production commit: `45377355`.
> All admin actions call `/.netlify/functions/admin-data` (POST, x-admin-password header) unless noted otherwise.

---

## Column / Field Semantics

### `user_master_profiles.is_test`

Boolean. `true` = internal/test account, excluded from all KPIs and Founding Beta eligibility.
`false` (default for real signups) = real B2C user.

**Do not flip manually.** Use `execute_mark_test` which enforces `PROTECTED_REAL_USERS` guard.

### `user_master_profiles.founding_offer_enabled`

Boolean DEFAULT `true`. Controls the Founding Beta offer gate for this specific user.

| Value | Meaning |
|---|---|
| `true` | Normal flow — Founding modal eligible on next qualified login |
| `false` | Deferred — offer suppressed at get_status, mark_offered, and accept |

> **`false` does NOT mean:** test account, declined, inactive, or rejected.
> **It means:** temporarily deferred by controlled rollout. The user is still Founding-eligible; the founder will enable them at the right time.

Changing `false → true` via Admin "Habilitar Founding →" does NOT send email, offer, or grant Pro. It merely unblocks the next genuine login from triggering the offer flow.

Fail-closed: if the gate query fails, the system treats the user as ineligible until confirmed.

### `user_master_profiles.lifecycle_state`

Denormalized cache. Source of truth is `user_events`. States: `signed_up` → `activated` → `engaged` → `churned`.
Activation = first useful outcome (cv_generated, ats_completed, cv_rewritten, workspace_created). NOT login or profile creation.

### `user_master_profiles.ttfv_seconds`

Time To First Value in seconds from signup to first activation event. Null if not yet activated.

### `founding_beta_enrollments.status`

Enum: `eligible | offered | accepted | active | completed | declined`.

Note: Status `offered` is a defined DB state but is NOT reached by the current V1 auto-flow (mark_offered is not called by the frontend). It can be set via admin-only `mark_founding_beta_offered` RPC.

### `email_log.idempotency_key`

Pattern: `<template>:<user_id>:v1`. Unique partial index prevents duplicate sends. Never add UNIQUE constraint to the full email_log table.

---

## Founder-Facing Definitions

| Term | Meaning |
|---|---|
| **REAL USER** | `is_test = false` — genuine B2C signup |
| **TEST USER** | `is_test = true` — internal/test account |
| **FOUNDING ELIGIBLE** | Non-test user who qualifies for the Founding 50 program |
| **FOUNDING ENABLED** | `founding_offer_enabled = true` — eligible and offer will be shown on next login |
| **FOUNDING DEFERRED** | `founding_offer_enabled = false` — eligible but offer postponed by controlled rollout |
| **FOUNDING OFFERED** | Enrollment exists with status `offered` (V1: not reached by auto-flow) |
| **FOUNDING ACCEPTED** | User clicked accept; enrollment status `accepted` or `active`; Pro granted |
| **PRO** | `is_subscribed = true` via Founding entitlement or paid subscription |
| **FREE** | `is_subscribed = false` |

---

## `founding_beta_stats`

Returns Founding Beta program KPIs.

**Parameters:** none

**Response:**

```json
{
  "program": "founding_beta_b2c",
  "limit": 50,
  "total_enrolled": 3,
  "total_active": 1,
  "slots_remaining": 47,
  "enrollments": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "email": "user@example.com",
      "status": "active",
      "cohort": "2026-Q3",
      "offered_at": "2026-08-19T00:00:00Z",
      "accepted_at": "2026-08-19T01:00:00Z",
      "activated_at": "2026-08-19T01:05:00Z",
      "benefit_start": "2026-08-19",
      "benefit_end": "2027-02-19"
    }
  ]
}
```

---

## `list_users_v2`

Paginated user list with lifecycle and test filters. Enriched with Founding Beta status.

**Parameters:**

| Field | Type | Default | Description |
|---|---|---|---|
| `limit` | number | 50 | Max rows to return |
| `offset` | number | 0 | Pagination offset |
| `is_test` | boolean \| null | null | Filter by test flag. null = all users |
| `lifecycle` | string \| null | null | Filter by `lifecycle_state`. null = all states |

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "Name",
      "is_test": false,
      "lifecycle_state": "activated",
      "created_at": "2026-08-19T00:00:00Z",
      "founding_beta": {
        "status": "active",
        "cohort": "2026-Q3",
        "activated_at": "2026-08-19T01:05:00Z"
      }
    }
  ],
  "count": 120,
  "offset": 0,
  "limit": 50
}
```

`founding_beta` is `null` if the user has no enrollment record.

---

## `user_detail`

Customer 360 view for a single user. Returns profile, Founding Beta enrollment, event history, email history, and acquisition source.

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `profileId` | string (uuid) | yes | `user_master_profiles.id` |

**Response:**

```json
{
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Name",
    "is_test": false,
    "lifecycle_state": "activated",
    "ttfv_seconds": 142,
    "first_value_event": "cv_generated",
    "created_at": "2026-08-19T00:00:00Z"
  },
  "founding_beta": {
    "status": "active",
    "cohort": "2026-Q3",
    "offered_at": "2026-08-19T00:00:00Z",
    "accepted_at": "2026-08-19T01:00:00Z",
    "activated_at": "2026-08-19T01:05:00Z",
    "dismissed_count": 0,
    "benefit_start": "2026-08-19",
    "benefit_end": "2027-02-19"
  },
  "events": [
    {
      "id": 1,
      "event_type": "cv_generated",
      "event_data": {},
      "occurred_at": "2026-08-19T01:03:00Z",
      "session_id": "sess_abc"
    }
  ],
  "emails_sent": [
    {
      "id": 1,
      "template": "founding_welcome_v1",
      "recipient_email": "user@example.com",
      "subject": "Bienvenido a Founding Beta",
      "status": "sent",
      "resend_id": "re_abc123",
      "sent_at": "2026-08-19T01:10:00Z"
    }
  ],
  "acquisition": {
    "source": "organic",
    "medium": "search",
    "campaign": null,
    "landing_page": "/",
    "referrer": null,
    "created_at": "2026-08-19T00:00:00Z"
  }
}
```

`founding_beta` and `acquisition` are `null` if no record exists.

---

## `preview_mark_test`

Dry-run for toggling a user's `is_test` flag. Shows what would happen without committing.

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `profileId` | string (uuid) | yes | Target profile |
| `value` | boolean | no | Desired `is_test` value. If omitted, shows current state only |

**Response:**

```json
{
  "preview": {
    "profileId": "uuid",
    "name": "User Name",
    "currentIsTest": false,
    "wouldSetTo": true,
    "protected": false,
    "protectedReason": null
  }
}
```

If user is in `PROTECTED_REAL_USERS`:

```json
{
  "preview": {
    "profileId": "e49a4c2b-8a7e-4d60-845b-c383472012a3",
    "name": "Rosarito Godoy",
    "currentIsTest": false,
    "wouldSetTo": true,
    "protected": true,
    "protectedReason": "Real user — protected from test flag changes"
  }
}
```

---

## `execute_mark_test`

Executes the `is_test` flag change. Enforces `PROTECTED_REAL_USERS` guard.

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `profileId` | string (uuid) | yes | Target profile |
| `value` | boolean | yes | Desired `is_test` value |

**Success response:**

```json
{ "ok": true }
```

**Failure response (protected user):**

HTTP 403:

```json
{ "error": "Protected user — cannot modify is_test flag" }
```

**Important:** Always use `execute_mark_test` from the admin UI — never use the legacy `toggle_test` action, which does not enforce the guard.

---

## `enable_founding_offer`

Enables the Founding Beta offer gate for a specific user (sets `founding_offer_enabled = true`).
Used via Admin Customer 360 "Habilitar Founding →" button for deferred users.

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | string (uuid) | yes | `user_master_profiles.user_id` (auth UUID, not profile id) |

**Success response:**

```json
{ "ok": true }
```

**Does NOT:**
- Send any email
- Mark the offer as shown
- Grant Pro
- Create an enrollment

The actual Founding offer fires on the user's next eligible login after this change.

---

## `send-founding-email` (Netlify function)

Sends a transactional email via Resend and logs the result to `email_log`.

**Endpoint:** `/.netlify/functions/send-founding-email`
**Auth:** Admin-only (requires admin JWT).

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `template` | string | yes | Template ID (see below) |
| `user_id` | string (uuid) | yes | Target user's profile ID |
| `recipient_email` | string | yes | Recipient email address |
| `recipient_name` | string | yes | Recipient display name |
| `force` | boolean | no | If `true`, bypasses dedup check. **Requires explicit authorization.** |

**Available templates:**

| Template | Description |
|---|---|
| `founding_welcome_v1` | Welcome email sent after Founding Beta activation |
| `founding_offer_v1` | Offer email prompting user to accept Founding Beta |

**Dedup behavior:** Before sending, the function queries `email_log` for an existing `(user_id, template)` pair. If found and `force` is not `true`, the send is skipped and a `{ "skipped": true }` response is returned.

**Success response:**

```json
{ "ok": true, "resend_id": "re_abc123" }
```

**Skip response (dedup):**

```json
{ "skipped": true, "reason": "already_sent" }
```

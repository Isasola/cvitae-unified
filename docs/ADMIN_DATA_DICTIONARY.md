# CVitae Admin — Data Dictionary

> New actions introduced in Founding Beta Operating System (2026-08-19).
> All actions are called via `/.netlify/functions/admin-data` unless noted otherwise.

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

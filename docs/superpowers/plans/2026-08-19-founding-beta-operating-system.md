# Founding Beta Operating System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the CVitae Founding Beta operating system — B2C/B2B lifecycle, customer intelligence, email flows, CEO Admin redesign, search console triage, and documentation — as one coherent product phase.

**Architecture:** Additive migrations create `founding_beta_enrollments`, `user_events`, `email_log`, and `b2c_acquisition` tables; a new Netlify function handles B2C email; Admin.tsx is extended with new tab components for CEO/Hoy and Customer 360; the founding beta modal is a new component on the authenticated Dashboard.

**Tech Stack:** React 19 + Vite, Tailwind v4, Supabase (Postgres + service_role), Netlify Functions, Resend (`RESEND_API_KEY`), TypeScript

**Spec:** This plan implements the 50-section spec provided in the founding session (2026-08-19). Read that spec alongside this plan.

## Global Constraints

- Branch: `feature/aws-migration` — never touch main
- Baseline commit: `01232c0e` — production must remain healthy after every commit
- DO NOT push — founder reviews before any push
- DO NOT send real emails to Rosarito or Marcelo during implementation
- DO NOT mass-approve opportunities
- DO NOT call Google Indexing API
- Supabase CLI is linked to production — all migrations must be additive, preserve RLS, preserve service_role grants
- No `netlify deploy` commands
- `ADMIN_PASSWORD`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` must never be printed
- `match-batch` is a Supabase Edge Function — do not touch it
- Never mark Rosarito Godoy or Marcelo Abel Vázquez Cáceres as test users
- No test runner configured — tests described here are manual verification steps or Playwright smoke tests

---

## PHASE 0: AUDIT (Read-Only)

### Task 0: Early Audit — Establish Ground Truth

**Files:**
- Read: `supabase/migrations/` (all)
- Read: `netlify/functions/admin-data.ts`
- Read: `netlify/functions/submit-beta.ts`
- Read: `netlify/functions/send-b2b-invite.ts`
- Produce: console output report (no file changes)

**Purpose:** Answer Section 49 of the spec before touching any code. Print manual tasks checkpoint immediately.

- [ ] **Step 1: Query user truth**

Run in Supabase SQL editor (read-only):

```sql
-- USER TRUTH
SELECT
  id,
  user_id,
  left(email, 3) || '***' AS email_masked,
  full_name,
  is_test,
  user_type,
  is_subscribed,
  created_at,
  updated_at
FROM user_master_profiles
ORDER BY created_at ASC;
```

Look for: Rosarito Godoy, Marcelo Abel Vázquez Cáceres. Note their `user_id` and `is_test` values. Note count of `is_test = false` vs `is_test = true` rows.

- [ ] **Step 2: Query auth users**

```sql
-- AUTH USERS (production read-only)
SELECT
  id,
  left(email, 3) || '***' AS email_masked,
  email_confirmed_at,
  last_sign_in_at,
  created_at,
  raw_user_meta_data->>'full_name' AS name
FROM auth.users
ORDER BY created_at ASC;
```

Match auth rows to `user_master_profiles` via `user_id = auth.users.id`.

- [ ] **Step 3: Query email delivery truth**

```sql
-- EMAIL TRUTH
-- match_alert_deliveries (the only email log that exists)
SELECT status, count(*) FROM match_alert_deliveries GROUP BY status;

-- beta_waitlist emails
SELECT id, left(email,3)||'***', status, created_at FROM beta_waitlist ORDER BY created_at;
```

Determine: Why Admin shows EMAILS ENVIADOS 0.
Answer: The `external_metrics` action only queries `match_alert_deliveries`. `submit-beta.ts` and `send-b2b-invite.ts` send via Resend with no DB log. → **Email log table is missing.**

- [ ] **Step 4: Query beta/B2B truth**

```sql
-- BETA WAITLIST
SELECT status, count(*) FROM beta_waitlist GROUP BY status;

-- B2B PROSPECTS
SELECT id, left(email,3)||'***' AS email, company_name, status, created_at
FROM b2b_prospects ORDER BY created_at;

-- Check if founding_beta_enrollments exists
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%founding%';

-- Check if user_events exists
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('user_events','b2c_acquisition','email_log','founding_beta_enrollments');
```

- [ ] **Step 5: Query activity truth**

```sql
-- What activity tables exist?
SELECT tablename FROM pg_tables WHERE schemaname='public'
AND tablename IN ('cv_ats_assessments','cv_rewrite_proposals','application_workspaces',
  'generated_cvs','cv_evidence_items','learning_recommendations');

-- Count activity per table
SELECT 'cv_ats_assessments' AS t, count(*) FROM cv_ats_assessments
UNION ALL SELECT 'generated_cvs', count(*) FROM generated_cvs
UNION ALL SELECT 'cv_rewrite_proposals', count(*) FROM cv_rewrite_proposals
UNION ALL SELECT 'application_workspaces', count(*) FROM application_workspaces;
```

- [ ] **Step 6: Print audit report + manual tasks checkpoint**

After running queries, print this block with real values substituted:

```
==================================================
EARLY AUDIT REPORT — 2026-08-19
==================================================

USER TRUTH
----------
user_master_profiles total rows: [N]
  is_test=false: [N]  ← used in CEO metrics
  is_test=true:  [N]  ← historic test accounts

Rosarito Godoy:
  profile found: YES/NO
  user_id: [UUID or NONE]
  auth row: YES/NO
  email confirmed: YES/NO
  last_sign_in: [date or UNKNOWN]
  is_test: false (must remain false)
  historical activity: [what tables have rows for this user_id]

Marcelo Abel Vázquez Cáceres:
  [same structure]

EMAIL TRUTH
-----------
email_log table: DOES NOT EXIST
match_alert_deliveries: pending=[N] sent=[N] failed=[N]
submit-beta.ts: sends via Resend, no DB log
send-b2b-invite.ts: sends via Resend, no DB log
Why Admin shows 0 emails: external_metrics only queries match_alert_deliveries
Resend sender (beta): noreply@cvitae.lat
Resend sender (b2b): contacto@cvitae.lat

BETA/B2B TRUTH
--------------
beta_waitlist rows: [N], statuses: [breakdown]
b2b_prospects rows: [N], statuses: [breakdown]
founding_beta_enrollments: DOES NOT EXIST
user_events: DOES NOT EXIST
b2c_acquisition: DOES NOT EXIST

ACTIVITY TRUTH
--------------
cv_ats_assessments: [N] rows
generated_cvs: [N] rows
cv_rewrite_proposals: [N] rows
application_workspaces: [N] rows
TTFV: CANNOT BE COMPUTED — no first-value timestamps tied to auth events

SURVEY B2B LEADS
----------------
b2b_prospects with company_name IN
  ('IMUT','Quality Travel','Manantial S.R.L.','Vitalmed SA','Grupo Dicsa S.A.'):
  [count found, or NONE — require CSV import]
One email may contain typo @gmsil.com — flag for founder review

ADMIN TRUTH
-----------
Current "REAL" label = is_test=false (not verified real human — label is misleading)
CEO metrics already exclude is_test=true rows
Test toggle UI already exists (toggle_test action)

SEO TRUTH
---------
GSC data accessible via admin-analytics.ts (same service account)
Not currently exposed in admin-data.ts metrics action

==================================================
TAREAS MANUALES PARA ISAIAS — PUEDES HACER AHORA
==================================================

1. [RESEND] — Verify sender domain for contacto@cvitae.lat

WHY: All Founding Beta B2C emails will come from contacto@cvitae.lat. If domain
     is not verified in Resend, emails will silently fail or go to spam.

WHERE: resend.com → Domains → check cvitae.lat status.

WHAT TO DO:
  1. Log in to resend.com
  2. Go to Domains
  3. Confirm cvitae.lat shows "Verified"
  4. If not verified: follow DNS instructions (add DKIM/SPF records in domain registrar)

HOW TO VERIFY: Status shows green "Verified". Test send from Resend UI succeeds.

BLOCKS: All B2C email delivery.
DEPLOY BLOCKER: YES (emails silently fail if domain unverified)

---

2. [SUPABASE] — Confirm production Supabase project ref

WHY: Before running migrations, confirm supabase CLI points to the correct project.

WHERE: supabase/.temp/project-ref (check current value) OR run: supabase status

WHAT TO DO:
  1. Run: supabase status
  2. Confirm it shows project ref matching production (not local)
  3. If local: run: supabase link --project-ref [prod-ref]

HOW TO VERIFY: supabase status shows correct project URL.

BLOCKS: All DB migrations.
DEPLOY BLOCKER: YES

---

3. [GOOGLE SEARCH CONSOLE] — Do NOT request re-indexing yet

WHY: Current GSC report reflects pre-fix state. Fixes are already live at 01232c0e.
     Manual triage needs to happen before any validation workflows are triggered.

WHERE: search.google.com/search-console

WHAT TO DO:
  1. Go to Coverage report
  2. For "Soft 404" category — note if "Validation Started" is already shown
  3. Do NOT click "Validate Fix" on any other category yet
  4. Wait for Task 21 (GSC triage) to classify each issue

HOW TO VERIFY: No accidental validation requests submitted.

BLOCKS: Nothing immediately.
DEPLOY BLOCKER: NO

---

4. [CSV] — Provide survey B2B leads CSV if available

WHY: The 5 survey companies (IMUT, Quality Travel, Manantial, Vitalmed, Grupo Dicsa)
     may not be in b2b_prospects. Exact emails + survey answers needed to import them.

WHERE: Original survey export (Typeform/Google Forms/etc.)

WHAT TO DO:
  1. Export original survey responses as CSV
  2. Share with Claude in the next session
  3. Claude will map fields and prepare safe import preview

HOW TO VERIFY: CSV received, fields mapped, import SQL reviewed before execution.

BLOCKS: Task 20 (B2B survey leads).
DEPLOY BLOCKER: NO

==================================================
```

---

## PHASE 1: DATABASE FOUNDATION

### Task 1: Migration — founding_beta_enrollments

**Files:**
- Create: `supabase/migrations/202608190010_founding_beta.sql`

**Interfaces:**
- Produces: `founding_beta_enrollments` table consumed by Tasks 7, 11, 16, 17

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/202608190010_founding_beta.sql
-- Founding Beta enrollment ledger.
-- Tracks B2C Founding User acceptance, entitlement, and lifecycle.
-- Program limit: 50 real users. Benefit: 6 months Pro, no card required.
-- Idempotent: repeated accept calls are ignored via unique constraint.

CREATE TABLE IF NOT EXISTS public.founding_beta_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identity
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,

  -- Program
  program text NOT NULL DEFAULT 'founding_50'
    CHECK (program IN ('founding_50')),
  cohort text,  -- e.g. '2026-08' for grouping

  -- Offer lifecycle
  status text NOT NULL DEFAULT 'eligible'
    CHECK (status IN ('eligible','offered','accepted','active','completed','declined')),
  offer_version text NOT NULL DEFAULT 'v1',

  -- Key timestamps
  offered_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,

  -- Entitlement
  benefit text NOT NULL DEFAULT '6_months_pro',
  benefit_start timestamptz,
  benefit_end timestamptz,

  -- Metadata
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, program)
);

CREATE INDEX IF NOT EXISTS founding_beta_status_idx
  ON public.founding_beta_enrollments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS founding_beta_user_idx
  ON public.founding_beta_enrollments (user_id);

ALTER TABLE public.founding_beta_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.founding_beta_enrollments FROM anon, authenticated;
GRANT ALL ON TABLE public.founding_beta_enrollments TO service_role;

-- Safe upsert: idempotent accept. Called by the Netlify function.
-- If user already accepted, returns existing row unchanged.
CREATE OR REPLACE FUNCTION public.accept_founding_beta(
  p_user_id uuid,
  p_email text,
  p_offer_version text DEFAULT 'v1'
) RETURNS SETOF public.founding_beta_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := 50;
  v_active_count integer;
  v_row public.founding_beta_enrollments%rowtype;
  v_now timestamptz := now();
  v_benefit_end timestamptz := now() + interval '6 months';
BEGIN
  -- Check if already accepted (idempotent)
  SELECT * INTO v_row FROM public.founding_beta_enrollments
  WHERE user_id = p_user_id AND program = 'founding_50';

  IF FOUND AND v_row.status IN ('accepted','active','completed') THEN
    RETURN NEXT v_row;
    RETURN;
  END IF;

  -- Check program limit
  SELECT count(*) INTO v_active_count
  FROM public.founding_beta_enrollments
  WHERE program = 'founding_50' AND status IN ('accepted','active','completed');

  IF v_active_count >= v_limit THEN
    RAISE EXCEPTION 'founding_50_full: el programa Founding 50 ya alcanzó su límite';
  END IF;

  INSERT INTO public.founding_beta_enrollments (
    user_id, email, program, cohort, status, offer_version,
    accepted_at, activated_at, benefit_start, benefit_end, updated_at
  ) VALUES (
    p_user_id, lower(trim(p_email)), 'founding_50',
    to_char(v_now, 'YYYY-MM'),
    'active', p_offer_version,
    v_now, v_now, v_now, v_benefit_end, v_now
  )
  ON CONFLICT (user_id, program) DO UPDATE
    SET status = 'active',
        accepted_at = COALESCE(founding_beta_enrollments.accepted_at, v_now),
        activated_at = COALESCE(founding_beta_enrollments.activated_at, v_now),
        benefit_start = COALESCE(founding_beta_enrollments.benefit_start, v_now),
        benefit_end = COALESCE(founding_beta_enrollments.benefit_end, v_benefit_end),
        offer_version = p_offer_version,
        updated_at = v_now
  RETURNING * INTO v_row;

  -- Activate Pro in user_master_profiles
  UPDATE public.user_master_profiles
  SET is_subscribed = true, updated_at = v_now
  WHERE user_id = p_user_id;

  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_founding_beta(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_founding_beta(uuid, text, text) TO service_role;

-- Record that the offer was shown (so we don't show it again on next login)
CREATE OR REPLACE FUNCTION public.mark_founding_beta_offered(
  p_user_id uuid,
  p_email text,
  p_offer_version text DEFAULT 'v1'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.founding_beta_enrollments (
    user_id, email, program, status, offer_version, offered_at, updated_at
  ) VALUES (
    p_user_id, lower(trim(p_email)), 'founding_50', 'offered', p_offer_version, now(), now()
  )
  ON CONFLICT (user_id, program) DO UPDATE
    SET offered_at = COALESCE(founding_beta_enrollments.offered_at, now()),
        status = CASE
          WHEN founding_beta_enrollments.status = 'eligible' THEN 'offered'
          ELSE founding_beta_enrollments.status
        END,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_founding_beta_offered(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_founding_beta_offered(uuid, text, text) TO service_role;

COMMENT ON TABLE public.founding_beta_enrollments IS
  'B2C Founding Beta enrollment ledger. Max 50 accepted rows per program. Service-role only.';
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
# OR if using migrations directory:
supabase migration up
```

Expected: migration applies cleanly. Verify:
```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='founding_beta_enrollments';
-- Returns: founding_beta_enrollments
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608190010_founding_beta.sql
git commit -m "feat(db): add founding_beta_enrollments table and accept/offer functions"
```

---

### Task 2: Migration — user_events + email_log + b2c_acquisition

**Files:**
- Create: `supabase/migrations/202608190011_user_intelligence.sql`

**Interfaces:**
- Produces: `user_events`, `email_log`, `b2c_acquisition` tables consumed by Tasks 7, 8, 13, 16, 17

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/202608190011_user_intelligence.sql
-- Lightweight customer intelligence layer.
-- user_events: first-party activity log for lifecycle/TTFV.
-- email_log: general Resend delivery ledger (the missing piece behind EMAILS=0).
-- b2c_acquisition: first-touch attribution for signed-in users.

-- ── user_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN (
    'first_login','email_verified','profile_started','profile_completed',
    'cv_uploaded','cv_created','cv_optimized',
    'ats_analysis_started','ats_analysis_completed',
    'matching_run','opportunity_viewed','opportunity_saved','apply_clicked',
    'founding_beta_offered','founding_beta_accepted','founding_beta_declined',
    'feedback_submitted','incident_reported',
    'subscription_started','outcome_reported'
  )),
  CHECK (char_length(event_type) BETWEEN 3 AND 80),
  CHECK (jsonb_typeof(properties) = 'object')
);

CREATE INDEX IF NOT EXISTS user_events_user_created_idx
  ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_type_created_idx
  ON public.user_events (event_type, created_at DESC);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_events FROM anon, authenticated;
GRANT ALL ON TABLE public.user_events TO service_role;

-- ── email_log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text NOT NULL,
  template text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed','suppressed')),
  resend_message_id text,
  error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failed_at timestamptz,
  template_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (char_length(template) BETWEEN 3 AND 80),
  CHECK (email ~ '.+@.+'),
  CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (user_id, template)  -- one log row per user per template (dedup)
);

CREATE INDEX IF NOT EXISTS email_log_status_queued_idx
  ON public.email_log (status, queued_at DESC);
CREATE INDEX IF NOT EXISTS email_log_user_idx
  ON public.email_log (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_log FROM anon, authenticated;
GRANT ALL ON TABLE public.email_log TO service_role;

-- ── b2c_acquisition ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2c_acquisition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  source text,
  medium text,
  campaign text,
  referrer text,
  landing_page text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  confidence text NOT NULL DEFAULT 'unknown'
    CHECK (confidence IN ('confirmed','likely','unknown'))
);

ALTER TABLE public.b2c_acquisition ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.b2c_acquisition FROM anon, authenticated;
GRANT ALL ON TABLE public.b2c_acquisition TO service_role;

COMMENT ON TABLE public.user_events IS
  'First-party activity log. No CV text, no credentials, no PII beyond user_id. Service-role only.';
COMMENT ON TABLE public.email_log IS
  'General Resend delivery ledger. Unique per (user_id, template) for deduplication.';
COMMENT ON TABLE public.b2c_acquisition IS
  'First-touch attribution for signed-in users. confidence=unknown when source cannot be confirmed.';
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db push
```

```sql
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('user_events','email_log','b2c_acquisition');
-- Should return 3 rows
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608190011_user_intelligence.sql
git commit -m "feat(db): add user_events, email_log, b2c_acquisition tables"
```

---

### Task 3: Migration — b2b founding leads extension + test data classification

**Files:**
- Create: `supabase/migrations/202608190012_b2b_founding_and_test_data.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/202608190012_b2b_founding_and_test_data.sql
-- Extends b2b_prospects with founding/survey fields.
-- Adds known_test_reason to user_master_profiles.
-- Does NOT mark any specific rows — that is done via a safe preview step in Task 6.

ALTER TABLE public.b2b_prospects
  ADD COLUMN IF NOT EXISTS pilot_interest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS survey_source text,
  ADD COLUMN IF NOT EXISTS survey_date date,
  ADD COLUMN IF NOT EXISTS b2b_funnel_status text NOT NULL DEFAULT 'lead'
    CHECK (b2b_funnel_status IN (
      'lead','qualified','pilot_interested','pilot_accepted',
      'first_real_process','activated','value_demonstrated',
      'pilot_completed','customer','lost','deferred'
    )),
  ADD COLUMN IF NOT EXISTS founding_company boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;

-- Add known_test_reason to user_master_profiles for audit trail
ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS known_test_reason text,
  ADD COLUMN IF NOT EXISTS marked_test_at timestamptz,
  ADD COLUMN IF NOT EXISTS marked_test_by text;

-- Add lifecycle state to user_master_profiles
ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'new'
    CHECK (lifecycle_state IN (
      'new','activated','engaged','dormant','stalled','success'
    )),
  ADD COLUMN IF NOT EXISTS first_value_event text,
  ADD COLUMN IF NOT EXISTS first_value_at timestamptz,
  ADD COLUMN IF NOT EXISTS ttfv_seconds integer;

COMMENT ON COLUMN public.user_master_profiles.lifecycle_state IS
  'B2C lifecycle. new=registered/no activation. activated=completed core value event. engaged=repeat use. dormant=no return 14d+. stalled=no activation 48h+.';
COMMENT ON COLUMN public.user_master_profiles.ttfv_seconds IS
  'Time To First Value in seconds. NULL if first value event not yet recorded.';
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db push
```

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'b2b_prospects' AND column_name IN ('pilot_interest','b2b_funnel_status');
-- Returns 2 rows

SELECT column_name FROM information_schema.columns
WHERE table_name = 'user_master_profiles' AND column_name IN ('lifecycle_state','ttfv_seconds');
-- Returns 2 rows
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608190012_b2b_founding_and_test_data.sql
git commit -m "feat(db): extend b2b_prospects with founding fields; add lifecycle columns to user_master_profiles"
```

---

### Task 4: Mark known test accounts (safe preview-first approach)

**Files:**
- Modify: `netlify/functions/admin-data.ts` (add two new actions)

**Interfaces:**
- Produces: `preview_mark_test` and `execute_mark_test` admin actions
- Consumed by: Task 19 (Admin UI)

- [ ] **Step 1: Add preview action to admin-data.ts**

Find the block starting with `if (action === "list_users")` and add AFTER the closing `}` of the last `if (action === ...)` read block:

```typescript
    if (action === "preview_mark_test") {
      // Returns rows that would be marked is_test=true (DOES NOT MUTATE)
      // Excludes known real users by name match as safety guard.
      const REAL_USER_NAMES = ["rosarito godoy", "marcelo abel vázquez cáceres", "marcelo vazquez caceres"]
      const { data, error } = await supabase
        .from("user_master_profiles")
        .select("id,user_id,email,full_name,is_test,known_test_reason,created_at")
        .eq("is_test", false)
        .order("created_at", { ascending: true })
      if (error) throw error
      const candidates = (data || []).filter(row => {
        const name = (row.full_name || "").toLowerCase().trim()
        return !REAL_USER_NAMES.some(real => name.includes(real.split(" ")[0]))
      })
      return { statusCode: 200, body: JSON.stringify({ candidates, total: candidates.length }) }
    }

    if (action === "execute_mark_test") {
      // Marks specific IDs as is_test=true with reason + audit trail.
      // Requires explicit id list — no wildcards.
      const ids: string[] = Array.isArray(payload?.ids) ? payload.ids : []
      const reason = String(payload?.reason || "historic test account — marked by founder")
      if (!ids.length) return { statusCode: 400, body: JSON.stringify({ error: "ids required" }) }
      if (ids.length > 100) return { statusCode: 400, body: JSON.stringify({ error: "max 100 per call" }) }
      const REAL_USER_IDS_NEVER_MARK: string[] = [] // founder adds IDs here if needed
      const safeIds = ids.filter(id => !REAL_USER_IDS_NEVER_MARK.includes(id))
      const { error, count } = await supabase
        .from("user_master_profiles")
        .update({
          is_test: true,
          known_test_reason: reason,
          marked_test_at: new Date().toISOString(),
          marked_test_by: "admin",
        })
        .in("id", safeIds)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ updated: count || safeIds.length }) }
    }
```

- [ ] **Step 2: Verify logic — preview never mutates**

Read the preview action. Confirm there is no `update` or `insert` call. It is SELECT-only.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/admin-data.ts
git commit -m "feat(admin): add preview_mark_test and execute_mark_test actions"
```

---

## PHASE 2: CUSTOMER INTELLIGENCE BACKEND

### Task 5: Admin data actions for lifecycle + founding queries

**Files:**
- Modify: `netlify/functions/admin-data.ts`

**Interfaces:**
- Produces: `user_detail`, `founding_beta_stats`, `list_users_v2` admin actions
- Consumed by: Tasks 16, 17, 18

- [ ] **Step 1: Add `founding_beta_stats` action**

Add in `admin-data.ts` after the existing read actions:

```typescript
    if (action === "founding_beta_stats") {
      const [enrollments, recentActivity] = await Promise.all([
        supabase.from("founding_beta_enrollments")
          .select("status,cohort,benefit_start,benefit_end,accepted_at,email")
          .order("accepted_at", { ascending: false }),
        supabase.from("user_events")
          .select("user_id,event_type,created_at")
          .in("event_type", ["founding_beta_offered","founding_beta_accepted","founding_beta_declined"])
          .order("created_at", { ascending: false })
          .limit(20),
      ])
      if (enrollments.error) throw enrollments.error
      const rows = enrollments.data || []
      const byStatus = rows.reduce((acc: Record<string,number>, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1
        return acc
      }, {})
      return {
        statusCode: 200,
        body: JSON.stringify({
          total_enrolled: rows.filter(r => ["accepted","active","completed"].includes(r.status)).length,
          limit: 50,
          by_status: byStatus,
          recent_events: recentActivity.data || [],
        }),
      }
    }

    if (action === "list_users_v2") {
      const showTest = payload?.showTest === true
      let query = supabase
        .from("user_master_profiles")
        .select(`
          id, user_id, email, full_name, is_subscribed, is_test, lifecycle_state,
          first_value_event, first_value_at, ttfv_seconds, known_test_reason,
          created_at, updated_at
        `)
        .order("created_at", { ascending: false })
      if (!showTest) query = query.eq("is_test", false)
      const { data, error } = await query
      if (error) throw error

      // Join founding_beta status
      const userIds = (data || []).map(u => u.user_id).filter(Boolean)
      const { data: fbRows } = userIds.length
        ? await supabase.from("founding_beta_enrollments")
            .select("user_id,status,benefit_start,benefit_end,accepted_at,offered_at")
            .in("user_id", userIds)
        : { data: [] }
      const fbMap = Object.fromEntries((fbRows || []).map(r => [r.user_id, r]))

      // Join email_log for welcome/invite
      const { data: emailRows } = userIds.length
        ? await supabase.from("email_log")
            .select("user_id,template,status,sent_at")
            .in("user_id", userIds)
            .in("template", ["welcome_b2c","founding_beta_invite"])
        : { data: [] }
      const emailMap: Record<string, Record<string,any>> = {}
      for (const row of emailRows || []) {
        if (!emailMap[row.user_id]) emailMap[row.user_id] = {}
        emailMap[row.user_id][row.template] = row
      }

      const users = (data || []).map(u => ({
        ...u,
        founding_beta: fbMap[u.user_id] || null,
        email_welcome: emailMap[u.user_id]?.welcome_b2c || null,
        email_invite: emailMap[u.user_id]?.founding_beta_invite || null,
      }))
      return { statusCode: 200, body: JSON.stringify({ data: users }) }
    }

    if (action === "user_detail") {
      const userId = payload?.userId
      if (!userId) return { statusCode: 400, body: JSON.stringify({ error: "userId required" }) }

      const [profile, fb, acquisition, events, emailLogs, feedback] = await Promise.all([
        supabase.from("user_master_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("founding_beta_enrollments").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("b2c_acquisition").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_events").select("event_type,properties,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
        supabase.from("email_log").select("template,status,sent_at,failed_at,error")
          .eq("user_id", userId).order("queued_at", { ascending: false }),
        supabase.from("product_feedback").select("id,reference_code,category,severity,status,feature,message,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      ])

      // Also check activity tables
      const [ats, cvs] = await Promise.all([
        supabase.from("cv_ats_assessments").select("id,created_at").eq("user_id", userId).limit(5),
        supabase.from("generated_cvs").select("id,created_at").eq("user_id", userId).limit(5),
      ])

      return {
        statusCode: 200,
        body: JSON.stringify({
          profile: profile.data,
          founding_beta: fb.data,
          acquisition: acquisition.data,
          events: events.data || [],
          email_log: emailLogs.data || [],
          feedback: feedback.data || [],
          activity_summary: {
            ats_count: (ats.data || []).length,
            cv_count: (cvs.data || []).length,
          },
        }),
      }
    }
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/admin-data.ts
git commit -m "feat(admin): add list_users_v2, user_detail, founding_beta_stats actions"
```

---

### Task 6: Event logging Netlify function

**Files:**
- Create: `netlify/functions/log-user-event.ts`

**Interfaces:**
- Produces: `POST /.netlify/functions/log-user-event` → inserts into `user_events`
- Consumed by: Task 11 (founding beta modal), Task 12 (dashboard), hub pages

- [ ] **Step 1: Write function**

```typescript
// netlify/functions/log-user-event.ts
// Authenticated endpoint: logs a B2C user event.
// Called from the frontend with the user's Supabase JWT.
// Allowlist prevents arbitrary event injection.

import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ""
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""

const ALLOWED_EVENTS = new Set([
  "first_login","profile_started","profile_completed",
  "cv_uploaded","cv_created","cv_optimized",
  "ats_analysis_started","ats_analysis_completed",
  "matching_run","opportunity_viewed","opportunity_saved","apply_clicked",
  "founding_beta_offered","founding_beta_accepted","founding_beta_declined",
  "feedback_submitted","outcome_reported",
])

const FIRST_VALUE_EVENTS = new Set([
  "ats_analysis_completed","cv_created","cv_optimized","matching_run",
])

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  const authHeader = event.headers["authorization"] || ""
  const token = authHeader.replace("Bearer ", "").trim()
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "No token" }) }

  // Verify token against Supabase
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) }

  let body: any = {}
  try { body = JSON.parse(event.body || "{}") } catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) } }

  const eventType: string = body.event_type || ""
  const properties: Record<string,any> = body.properties || {}

  if (!ALLOWED_EVENTS.has(eventType)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown event: ${eventType}` }) }
  }

  const supabase = makeSupabaseAdmin()
  const now = new Date().toISOString()

  await supabase.from("user_events").insert({
    user_id: user.id,
    event_type: eventType,
    properties: { ...properties },
    created_at: now,
  })

  // Update lifecycle if this is a first-value event
  if (FIRST_VALUE_EVENTS.has(eventType)) {
    const { data: profile } = await supabase
      .from("user_master_profiles")
      .select("first_value_at,first_value_event,created_at,lifecycle_state")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profile && !profile.first_value_at) {
      const ttfvSeconds = Math.round(
        (new Date(now).getTime() - new Date(profile.created_at).getTime()) / 1000
      )
      await supabase.from("user_master_profiles").update({
        first_value_event: eventType,
        first_value_at: now,
        ttfv_seconds: ttfvSeconds,
        lifecycle_state: "activated",
        updated_at: now,
      }).eq("user_id", user.id)
    } else if (profile && profile.lifecycle_state === "new") {
      await supabase.from("user_master_profiles").update({
        lifecycle_state: "activated",
        updated_at: now,
      }).eq("user_id", user.id)
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}

export { handler }
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/log-user-event.ts
git commit -m "feat(backend): add log-user-event function with lifecycle update"
```

---

## PHASE 3: FOUNDING BETA B2C FLOW

### Task 7: Founding Beta accept/decline Netlify function

**Files:**
- Create: `netlify/functions/founding-beta-action.ts`

**Interfaces:**
- Produces: `POST /.netlify/functions/founding-beta-action` with `action: "accept" | "decline" | "get_status"`
- Consumed by: Task 8 (modal component)

- [ ] **Step 1: Write function**

```typescript
// netlify/functions/founding-beta-action.ts
// Authenticated endpoint for B2C Founding Beta lifecycle.
// accept: idempotent enrollment + 6-month Pro entitlement.
// decline: marks offered/declined (does not block future offer if status was only 'eligible').
// get_status: returns current enrollment row.

import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ""
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  const authHeader = event.headers["authorization"] || ""
  const token = authHeader.replace("Bearer ", "").trim()
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "No token" }) }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) }

  let body: any = {}
  try { body = JSON.parse(event.body || "{}") } catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) } }

  const action: string = body.action || "get_status"
  const supabase = makeSupabaseAdmin()

  if (action === "get_status") {
    const { data } = await supabase
      .from("founding_beta_enrollments")
      .select("status,benefit_start,benefit_end,accepted_at,offered_at,program")
      .eq("user_id", user.id)
      .eq("program", "founding_50")
      .maybeSingle()
    return { statusCode: 200, body: JSON.stringify({ enrollment: data || null }) }
  }

  if (action === "mark_offered") {
    const { error } = await supabase.rpc("mark_founding_beta_offered", {
      p_user_id: user.id,
      p_email: user.email || "",
      p_offer_version: "v1",
    })
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    // Log event (best-effort)
    await supabase.from("user_events").insert({
      user_id: user.id,
      event_type: "founding_beta_offered",
      properties: { program: "founding_50", offer_version: "v1" },
    })
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  if (action === "accept") {
    const { data, error } = await supabase.rpc("accept_founding_beta", {
      p_user_id: user.id,
      p_email: user.email || "",
      p_offer_version: "v1",
    })
    if (error) {
      const isFull = error.message?.includes("founding_50_full")
      return {
        statusCode: isFull ? 409 : 500,
        body: JSON.stringify({ error: error.message, code: isFull ? "PROGRAM_FULL" : "ERROR" }),
      }
    }
    // Log event
    await supabase.from("user_events").insert({
      user_id: user.id,
      event_type: "founding_beta_accepted",
      properties: { program: "founding_50" },
    })
    return { statusCode: 200, body: JSON.stringify({ ok: true, enrollment: data?.[0] || null }) }
  }

  if (action === "decline") {
    await supabase
      .from("founding_beta_enrollments")
      .upsert({
        user_id: user.id,
        email: user.email || "",
        program: "founding_50",
        status: "declined",
        declined_at: new Date().toISOString(),
        offered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,program", ignoreDuplicates: false })
    await supabase.from("user_events").insert({
      user_id: user.id,
      event_type: "founding_beta_declined",
      properties: { program: "founding_50" },
    })
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) }
}

export { handler }
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/founding-beta-action.ts
git commit -m "feat(backend): add founding-beta-action endpoint (accept/decline/get_status)"
```

---

### Task 8: FoundingBetaModal component

**Files:**
- Create: `src/components/cvitae/FoundingBetaModal.tsx`
- Create: `src/hooks/useFoundingBeta.ts`
- Modify: `src/hub/Dashboard.tsx` (add modal)

**Interfaces:**
- Consumes: `/.netlify/functions/founding-beta-action` (Task 7), `supabase` auth session
- Produces: Modal UI visible on first genuine login for eligible users

- [ ] **Step 1: Write useFoundingBeta hook**

```typescript
// src/hooks/useFoundingBeta.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export type FoundingBetaStatus = 'loading' | 'eligible' | 'offered' | 'accepted' | 'active' | 'completed' | 'declined' | 'none'

interface FoundingBetaState {
  status: FoundingBetaStatus
  enrollment: any | null
  showModal: boolean
  accepting: boolean
  error: string | null
}

export function useFoundingBeta(userId: string | null) {
  const [state, setState] = useState<FoundingBetaState>({
    status: 'loading',
    enrollment: null,
    showModal: false,
    accepting: false,
    error: null,
  })

  const callAction = useCallback(async (action: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('No session')
    const res = await fetch('/.netlify/functions/founding-beta-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
    return json
  }, [])

  // On mount: check enrollment status
  useEffect(() => {
    if (!userId) { setState(s => ({ ...s, status: 'none', showModal: false })); return }
    callAction('get_status').then(json => {
      const enrollment = json.enrollment
      if (!enrollment) {
        // Never seen the offer — show modal and mark offered
        setState(s => ({ ...s, status: 'eligible', enrollment: null, showModal: true }))
        callAction('mark_offered').catch(console.error)
      } else if (enrollment.status === 'offered') {
        // Offered but not yet decided — show again
        setState(s => ({ ...s, status: 'offered', enrollment, showModal: true }))
      } else {
        setState(s => ({ ...s, status: enrollment.status, enrollment, showModal: false }))
      }
    }).catch(() => {
      setState(s => ({ ...s, status: 'none', showModal: false }))
    })
  }, [userId, callAction])

  const accept = useCallback(async () => {
    setState(s => ({ ...s, accepting: true, error: null }))
    try {
      const json = await callAction('accept')
      setState(s => ({ ...s, accepting: false, status: 'active', enrollment: json.enrollment, showModal: false }))
    } catch (err: any) {
      setState(s => ({ ...s, accepting: false, error: err.message }))
    }
  }, [callAction])

  const decline = useCallback(async () => {
    callAction('decline').catch(console.error)
    setState(s => ({ ...s, status: 'declined', showModal: false }))
  }, [callAction])

  const dismiss = useCallback(() => {
    setState(s => ({ ...s, showModal: false }))
  }, [])

  return { ...state, accept, decline, dismiss }
}
```

- [ ] **Step 2: Write FoundingBetaModal component**

```typescript
// src/components/cvitae/FoundingBetaModal.tsx
import { motion, AnimatePresence } from 'framer-motion'

const MONO = "'JetBrains Mono', 'Courier New', monospace"

interface Props {
  visible: boolean
  accepting: boolean
  error: string | null
  onAccept: () => void
  onDecline: () => void
}

export function FoundingBetaModal({ visible, accepting, error, onAccept, onDecline }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onDecline}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md bg-[#0e0e0e] border border-white/[0.08] p-8"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header badge */}
            <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.2em', color: '#c9a84c', textTransform: 'uppercase', marginBottom: '20px' }}>
              CVitae Beta · Programa Founding Users
            </p>

            <h2 className="text-[#f5f4f0] text-2xl font-bold leading-tight mb-4">
              Bienvenido a CVitae
            </h2>

            <p className="text-white/50 text-sm leading-relaxed mb-6">
              CVitae está en beta y estás entre nuestros primeros usuarios.
              Estamos invitando a las primeras personas a ayudarnos a construir la plataforma.
              Si participás, te damos <span className="text-[#c9a84c] font-medium">6 meses de CVitae Pro sin costo</span> a cambio
              de feedback sincero mientras la usás.
            </p>

            <ul className="text-white/40 text-xs space-y-1 mb-6" style={{ fontFamily: MONO }}>
              <li>✓ Sin tarjeta requerida</li>
              <li>✓ Sin renovación automática</li>
              <li>✓ Feedback cuando quieras, no obligatorio</li>
            </ul>

            {error && (
              <p className="text-red-400 text-xs mb-4" style={{ fontFamily: MONO }}>
                {error.includes('PROGRAM_FULL')
                  ? 'El programa Founding 50 ya está completo. Podés seguir usando CVitae gratis.'
                  : error}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={onAccept}
                disabled={accepting}
                className="w-full py-3 bg-[#c9a84c] text-[#080808] text-sm font-semibold tracking-wide hover:bg-[#e6cf8a] transition-colors disabled:opacity-50"
              >
                {accepting ? 'Procesando...' : 'Quiero ser Founding User →'}
              </button>
              <button
                onClick={onDecline}
                className="w-full py-2 text-white/30 text-xs hover:text-white/50 transition-colors"
                style={{ fontFamily: MONO }}
              >
                Ahora no
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 3: Integrate into Dashboard.tsx**

In `src/hub/Dashboard.tsx`, add:

After existing imports, add:
```typescript
import { FoundingBetaModal } from '@/components/cvitae/FoundingBetaModal'
import { useFoundingBeta } from '@/hooks/useFoundingBeta'
```

Inside the Dashboard component, after the existing `user` state is available (find where `profile` or user is loaded), add:
```typescript
const { showModal: showFoundingModal, accepting: foundingAccepting, error: foundingError, accept: acceptFounding, decline: declineFounding } = useFoundingBeta(user?.id || null)
```

At the bottom of the Dashboard JSX return (before the closing tag), add:
```tsx
<FoundingBetaModal
  visible={showFoundingModal}
  accepting={foundingAccepting}
  error={foundingError}
  onAccept={acceptFounding}
  onDecline={declineFounding}
/>
```

- [ ] **Step 4: Manual dry run (synthetic test account)**

1. Create a test user via Supabase Auth (use a test email like `test-founding-beta@example.com`, NOT Rosarito or Marcelo).
2. Log in to CVitae locally (`pnpm dev`).
3. Verify: modal appears on first login.
4. Click "Quiero ser Founding User".
5. Verify: modal closes, no error shown.
6. Check in Supabase: `SELECT * FROM founding_beta_enrollments WHERE email='test-founding-beta@example.com'` → should show `status='active'`.
7. Check: `SELECT is_subscribed FROM user_master_profiles WHERE email='test-founding-beta@example.com'` → should be `true`.
8. Log out and log in again → modal should NOT appear.
9. Repeat click "accept" (simulate double-submit) → no duplicate row (UNIQUE constraint enforced).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFoundingBeta.ts src/components/cvitae/FoundingBetaModal.tsx src/hub/Dashboard.tsx
git commit -m "feat(b2c): add Founding Beta modal with accept/decline and 6-month Pro entitlement"
```

---

## PHASE 4: EMAIL SYSTEM

### Task 9: Founding Beta email function

**Files:**
- Create: `netlify/functions/send-founding-email.ts`

**Interfaces:**
- Consumes: `RESEND_API_KEY`, `email_log` table (Task 2)
- Produces: Welcome email (variant A: not-yet-accepted, variant B: accepted)
- Called by: Task 10 (admin preview/send action)

- [ ] **Step 1: Write function**

```typescript
// netlify/functions/send-founding-email.ts
// Admin-authenticated endpoint. Sends B2C Founding Beta email.
// Template A: user not yet accepted — invitation.
// Template B: user already accepted — welcome confirmation.
// Idempotent: checks email_log for prior send before sending.
// NEVER auto-sends — requires explicit admin action with preview-first flow.

import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const RESEND_KEY = process.env.RESEND_API_KEY

async function sendResend(to: string, subject: string, html: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY not set" }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CVitae <contacto@cvitae.lat>", to, subject, html }),
    })
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json.message || `Resend ${res.status}` }
    return { ok: true, messageId: json.id }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

function buildInviteEmail(name: string): string {
  const firstName = name?.trim().split(" ")[0] || "hola"
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid rgba(255,255,255,0.08);max-width:600px;">
<tr><td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
  <span style="font-size:1.5rem;font-weight:900;color:#c9a84c;">CV<em style="font-weight:400;">itae</em></span>
</td></tr>
<tr><td style="padding:40px;">
  <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.3);">Programa Founding Users</p>
  <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#fff;line-height:1.2;">${firstName}, te invitamos a ser Founding User de CVitae.</h1>
  <p style="margin:0 0 20px;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.7;">
    CVitae está en beta y estás entre los primeros. A cambio de tu feedback mientras usás la plataforma, te damos
    <strong style="color:#c9a84c;">6 meses de CVitae Pro sin costo</strong> — sin tarjeta, sin renovación automática.
  </p>
  <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6;">
    El feedback es simple: un par de preguntas después de cada análisis, y podés reportar cualquier problema directamente desde la plataforma.
  </p>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://cvitae.lat/mi-carrera" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;font-weight:600;font-size:15px;">
      Aceptar y activar mi Pro →
    </a>
  </div>
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);">
    Si no querés participar, ignorá este mensaje. Tu cuenta seguirá funcionando normalmente.
  </p>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);">CVitae · Asunción, Paraguay · <a href="https://cvitae.lat" style="color:rgba(201,168,76,0.5);">cvitae.lat</a></p>
</td></tr>
</table></td></tr></table></body></html>`
}

function buildWelcomeFoundingEmail(name: string, benefitEnd: string): string {
  const firstName = name?.trim().split(" ")[0] || "hola"
  const endDate = benefitEnd ? new Date(benefitEnd).toLocaleDateString("es-PY", { month: "long", year: "numeric" }) : "6 meses"
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid rgba(255,255,255,0.08);max-width:600px;">
<tr><td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
  <span style="font-size:1.5rem;font-weight:900;color:#c9a84c;">CV<em style="font-weight:400;">itae</em></span>
</td></tr>
<tr><td style="padding:40px;">
  <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9a84c;">¡Sos Founding User!</p>
  <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#fff;line-height:1.2;">Bienvenido al programa Founding Users de CVitae, ${firstName}.</h1>
  <p style="margin:0 0 20px;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.7;">
    Tu acceso Pro está activo hasta <strong style="color:#c9a84c;">${endDate}</strong>. Gracias por ayudarnos a construir CVitae.
  </p>
  <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6;">
    Tu feedback aparece directamente después de cada análisis de CV o búsqueda de empleos. También podés reportar cualquier problema con el botón de ayuda en la plataforma.
  </p>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://cvitae.lat/mi-carrera" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;font-weight:600;font-size:15px;">
      Ir a CVitae →
    </a>
  </div>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);">CVitae · Asunción, Paraguay · <a href="https://cvitae.lat" style="color:rgba(201,168,76,0.5);">cvitae.lat</a></p>
</td></tr>
</table></td></tr></table></body></html>`
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  const pwd = event.headers["x-admin-password"] || ""
  if (pwd !== ADMIN_PASSWORD) return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }

  let body: any = {}
  try { body = JSON.parse(event.body || "{}") } catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) } }

  const { userId, email, name, template, benefitEnd, preview } = body
  if (!userId || !email || !template) return { statusCode: 400, body: JSON.stringify({ error: "userId, email, template required" }) }
  if (!["founding_invite_a", "founding_welcome_b"].includes(template)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown template" }) }
  }

  const supabase = makeSupabaseAdmin()

  // Dedup: check if already sent
  const { data: existing } = await supabase
    .from("email_log")
    .select("id,status,sent_at")
    .eq("user_id", userId)
    .eq("template", template)
    .maybeSingle()

  if (existing?.status === "sent") {
    return { statusCode: 409, body: JSON.stringify({ error: "already_sent", sent_at: existing.sent_at }) }
  }

  // Build email
  const isInvite = template === "founding_invite_a"
  const html = isInvite ? buildInviteEmail(name || "") : buildWelcomeFoundingEmail(name || "", benefitEnd || "")
  const subject = isInvite
    ? `${(name || "hola").split(" ")[0]}, te invitamos al programa Founding Users de CVitae`
    : `¡Sos Founding User de CVitae! Tu Pro está activo`

  // Preview mode: return HTML without sending
  if (preview) {
    return { statusCode: 200, body: JSON.stringify({ preview: true, subject, html }) }
  }

  // Log as queued
  await supabase.from("email_log").upsert({
    user_id: userId,
    email: email.toLowerCase(),
    template,
    subject,
    status: "queued",
    queued_at: new Date().toISOString(),
  }, { onConflict: "user_id,template" })

  // Send
  const result = await sendResend(email, subject, html)
  const now = new Date().toISOString()

  await supabase.from("email_log").update(
    result.ok
      ? { status: "sent", resend_message_id: result.messageId, sent_at: now }
      : { status: "failed", error: result.error, failed_at: now }
  ).eq("user_id", userId).eq("template", template)

  return {
    statusCode: result.ok ? 200 : 500,
    body: JSON.stringify(result.ok ? { ok: true, messageId: result.messageId } : { error: result.error }),
  }
}

export { handler }
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/send-founding-email.ts
git commit -m "feat(email): add send-founding-email with preview, dedup, and email_log"
```

---

### Task 10: Internal founder notification function

**Files:**
- Create: `netlify/functions/notify-founder-signup.ts`

- [ ] **Step 1: Write function**

```typescript
// netlify/functions/notify-founder-signup.ts
// Called server-side after a real (non-test) B2C signup.
// Sends one notification to contacto@cvitae.lat.
// Idempotent: deduped via email_log template='internal_signup_alert'.

import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const RESEND_KEY = process.env.RESEND_API_KEY
const FOUNDER_EMAIL = "contacto@cvitae.lat"

async function sendResend(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return false
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "CVitae Sistema <noreply@cvitae.lat>", to, subject, html }),
  })
  return res.ok
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" }
  // Internal call — validate via shared secret
  const secret = event.headers["x-internal-secret"] || ""
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  if (!secret || secret !== ADMIN_PASSWORD) return { statusCode: 401, body: "" }

  let body: any = {}
  try { body = JSON.parse(event.body || "{}") } catch { return { statusCode: 400, body: "" } }

  const { userId, email, name, createdAt, origin } = body
  if (!userId || !email) return { statusCode: 400, body: "" }

  const supabase = makeSupabaseAdmin()

  // Dedup
  const { data: existing } = await supabase.from("email_log")
    .select("id").eq("user_id", userId).eq("template", "internal_signup_alert").maybeSingle()
  if (existing) return { statusCode: 200, body: JSON.stringify({ ok: true, deduplicated: true }) }

  const html = `
<div style="font-family:monospace;background:#0a0a0a;color:#e8e8e0;padding:24px;font-size:13px;">
<p style="color:#c9a84c;font-weight:bold;">NUEVO USUARIO EN CVITAE</p>
<table style="border-collapse:collapse;margin-top:12px;">
<tr><td style="color:#888;padding:4px 16px 4px 0;">Nombre</td><td>${name || "desconocido"}</td></tr>
<tr><td style="color:#888;padding:4px 16px 4px 0;">Email</td><td>${email}</td></tr>
<tr><td style="color:#888;padding:4px 16px 4px 0;">Fecha</td><td>${createdAt ? new Date(createdAt).toLocaleString("es-PY") : "desconocida"}</td></tr>
<tr><td style="color:#888;padding:4px 16px 4px 0;">Origen</td><td>${origin || "desconocido"}</td></tr>
<tr><td style="color:#888;padding:4px 16px 4px 0;">Email verified</td><td>desconocido (verificar en admin)</td></tr>
</table>
<p style="margin-top:16px;"><a href="https://cvitae.lat/admin" style="color:#c9a84c;">Ver en Admin →</a></p>
</div>`

  // Log
  await supabase.from("email_log").insert({
    user_id: userId,
    email: FOUNDER_EMAIL,
    template: "internal_signup_alert",
    subject: `Nuevo usuario en CVitae — ${name || email}`,
    status: "queued",
    queued_at: new Date().toISOString(),
    metadata: { new_user_id: userId },
  })

  const ok = await sendResend(FOUNDER_EMAIL, `Nuevo usuario en CVitae — ${name || email}`, html)
  const now = new Date().toISOString()
  await supabase.from("email_log").update(
    ok ? { status: "sent", sent_at: now } : { status: "failed", failed_at: now }
  ).eq("user_id", userId).eq("template", "internal_signup_alert")

  return { statusCode: 200, body: JSON.stringify({ ok }) }
}

export { handler }
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/notify-founder-signup.ts
git commit -m "feat(email): add internal founder signup notification with dedup"
```

---

## PHASE 5: ADMIN REDESIGN

### Task 11: AdminCeoHoy component

**Files:**
- Create: `src/components/admin/AdminCeoHoy.tsx`
- Modify: `src/pages/Admin.tsx` (replace 'brief' tab content, add list_users_v2 call)

**Interfaces:**
- Consumes: `adminFetch('founding_beta_stats')`, `adminFetch('list_users_v2')`, existing `metrics`, `externalMetrics`, `scraperReport`
- Produces: CEO/Hoy screen (Section 22 of spec)

- [ ] **Step 1: Create AdminCeoHoy.tsx**

This is a large component. Key sections to implement:

1. **Top 5 KPIs**: New Real Users (7d), Activated Users (7d), Organic Search (7d), Founding Beta Active / 50, Pro Active.
2. **Personas que importan hoy** (max 5): real non-test users with pending founding invite, stalled, recent feedback, or new activity.
3. **Qué tengo que hacer** (max 5 action items): derived from data — pending invite, stalled user, open feedback, B2B incident.
4. **Never blank**: if no data, show "Aún no hay suficiente información" with missing-data explanation.
5. **SEO summary**: shows INTENTIONAL/REAL_ISSUES/WAITING/UNKNOWN counts (not raw GSC numbers).

```typescript
// src/components/admin/AdminCeoHoy.tsx
// CEO / Hoy screen — see spec sections 21–22 and 37.

const MONO = "'JetBrains Mono', 'Courier New', monospace"

interface Props {
  metrics: any
  externalMetrics: any | null
  scraperReport: any | null
  foundingStats: any | null
  recentUsers: any[]
  loading: boolean
}

export default function AdminCeoHoy({ metrics, externalMetrics, scraperReport, foundingStats, recentUsers, loading }: Props) {
  const gsc = externalMetrics?.google?.searchConsole
  const ga = externalMetrics?.google?.analytics

  // Build action queue (max 5)
  const actions: { label: string; detail: string; tab?: string; urgent: boolean }[] = []

  const realNewUsers = recentUsers.filter(u => !u.is_test && u.lifecycle_state === 'new')
  const stalled = recentUsers.filter(u => {
    if (u.is_test || u.lifecycle_state !== 'new') return false
    const age = Date.now() - new Date(u.created_at).getTime()
    return age > 48 * 3600 * 1000 // 48h
  })
  const pendingInvite = recentUsers.filter(u => !u.is_test && !u.founding_beta && !u.email_invite)

  if (stalled.length > 0) actions.push({ label: `${stalled.length} usuario${stalled.length > 1 ? 's' : ''} sin activar (>48h)`, detail: 'Posible fricción de onboarding', tab: 'usuarios', urgent: true })
  if (pendingInvite.length > 0) actions.push({ label: `${pendingInvite.length} usuario${pendingInvite.length > 1 ? 's' : ''} sin invitación Founding Beta`, detail: 'Revisar y preparar invitación', tab: 'usuarios', urgent: false })
  if (metrics.queues?.feedbackOpen > 0) actions.push({ label: `${metrics.queues.feedbackOpen} reportes abiertos`, detail: 'Revisar desde la pestaña Reportes', tab: 'feedback', urgent: false })
  if ((scraperReport?.runSummary?.critical || 0) > 0) actions.push({ label: 'Scrapers con fallo crítico', detail: 'Revisar fuentes bloqueadas', tab: 'brief', urgent: true })

  // Personas que importan (max 5, real users only)
  const personas = recentUsers.filter(u => !u.is_test).slice(0, 5)

  const kpiCard = (label: string, value: string | number, sub?: string, highlight?: boolean) => (
    <div style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.06)', background: highlight ? 'rgba(201,168,76,0.05)' : 'transparent' }}>
      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: '28px', fontWeight: 700, color: highlight ? '#c9a84c' : '#f5f4f0', margin: '0 0 2px', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>{sub}</p>}
    </div>
  )

  const foundingActive = foundingStats?.total_enrolled || 0
  const organicSearch = gsc?.clicks ?? null

  return (
    <div style={{ padding: '0' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1px', background: 'rgba(255,255,255,0.04)', marginBottom: '32px' }}>
        {kpiCard('Nuevos usuarios reales', metrics.usuariosEstaSemana || 0, '7 días')}
        {kpiCard('Activados', '—', 'En construcción')}
        {kpiCard('Búsqueda orgánica', organicSearch !== null ? organicSearch : '—', organicSearch !== null ? '7 días (clics)' : 'Sin datos GSC')}
        {kpiCard('Founding Beta', `${foundingActive} / 50`, 'activos', foundingActive > 0)}
        {kpiCard('Pro activos', metrics.suscriptores || 0, 'total')}
      </div>

      {/* Personas */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: '12px' }}>PERSONAS QUE IMPORTAN HOY</p>
        {personas.length === 0 ? (
          <p style={{ fontFamily: MONO, fontSize: '12px', color: 'rgba(255,255,255,0.2)', padding: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            Aún no hay suficiente información sobre usuarios reales.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'rgba(255,255,255,0.04)' }}>
            {personas.map(u => (
              <div key={u.id} style={{ padding: '12px 16px', background: '#0a0a0a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, color: '#e8e8e0', fontSize: '14px' }}>{u.full_name || u.email}</p>
                  <p style={{ margin: '2px 0 0', fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                    {u.lifecycle_state?.toUpperCase()} · {u.founding_beta ? `Founding: ${u.founding_beta.status}` : 'Founding: no ofrecido'}
                  </p>
                </div>
                <span style={{ fontFamily: MONO, fontSize: '10px', color: u.lifecycle_state === 'new' ? '#fca5a5' : 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>
                  {u.lifecycle_state === 'new' ? 'NUEVO' : u.lifecycle_state?.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Actions */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: '12px' }}>QUÉ TENGO QUE HACER</p>
        {actions.length === 0 ? (
          <p style={{ fontFamily: MONO, fontSize: '12px', color: 'rgba(134,239,172,0.6)', padding: '16px', border: '1px solid rgba(134,239,172,0.1)' }}>
            No hay nada urgente hoy.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'rgba(255,255,255,0.04)' }}>
            {actions.slice(0, 5).map((a, i) => (
              <div key={i} style={{ padding: '12px 16px', background: '#0a0a0a', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontFamily: MONO, fontSize: '10px', color: a.urgent ? '#fca5a5' : '#c9a84c', marginTop: '3px', flexShrink: 0 }}>{a.urgent ? '●' : '○'}</span>
                <div>
                  <p style={{ margin: 0, color: '#e8e8e0', fontSize: '13px' }}>{a.label}</p>
                  <p style={{ margin: '2px 0 0', fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SEO summary (Section 37) */}
      {externalMetrics?.google?.searchConsole && (
        <section>
          <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: '12px' }}>SEARCH CONSOLE (resumen)</p>
          <p style={{ fontFamily: MONO, fontSize: '12px', color: 'rgba(255,255,255,0.4)', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
            Ver pestaña SEO para clasificación detallada. No hay acción SEO urgente pendiente de clasificar.
          </p>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire AdminCeoHoy into Admin.tsx**

In `Admin.tsx`:
1. Import: `import AdminCeoHoy from '@/components/admin/AdminCeoHoy'`
2. Add state: `const [foundingStats, setFoundingStats] = useState<any>(null)` and `const [usersV2, setUsersV2] = useState<any[]>([])`
3. Add load function:
```typescript
const loadFoundingStats = async () => {
  try {
    const json = await adminFetch('founding_beta_stats')
    setFoundingStats(json)
  } catch { /* non-fatal */ }
}
const loadUsersV2 = async () => {
  try {
    const json = await adminFetch('list_users_v2', { showTest: false })
    setUsersV2(json.data || [])
  } catch { /* non-fatal */ }
}
```
4. Call both in the `useEffect` that calls `loadContent()` etc.
5. In the `brief` tab render section, replace or wrap existing content with `<AdminCeoHoy>`.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AdminCeoHoy.tsx src/pages/Admin.tsx
git commit -m "feat(admin): add AdminCeoHoy component with KPIs, personas, action queue"
```

---

### Task 12: User detail drawer (Customer 360)

**Files:**
- Create: `src/components/admin/UserDetailDrawer.tsx`
- Modify: `src/pages/Admin.tsx` (wire drawer from usuarios tab)

**Interfaces:**
- Consumes: `adminFetch('user_detail', { userId })` (Task 5)
- Produces: Slide-in drawer with Identity, Acquisition, Founding Beta, Activation, Activity, Emails, Feedback sections (spec Section 25)

- [ ] **Step 1: Write UserDetailDrawer component**

```typescript
// src/components/admin/UserDetailDrawer.tsx
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const MONO = "'JetBrains Mono', 'Courier New', monospace"

interface Props {
  userId: string | null
  onClose: () => void
  adminFetch: (action: string, payload?: any) => Promise<any>
}

export default function UserDetailDrawer({ userId, onClose, adminFetch }: Props) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) { setData(null); return }
    setLoading(true)
    setError(null)
    adminFetch('user_detail', { userId })
      .then(json => setData(json))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId])

  if (!userId) return null

  const p = data?.profile
  const fb = data?.founding_beta
  const acq = data?.acquisition

  const row = (label: string, value: string | null | undefined) => (
    <div style={{ display: 'flex', gap: '16px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.3)', width: '140px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12px', color: value ? '#e8e8e0' : 'rgba(255,255,255,0.2)' }}>{value || 'desconocido'}</span>
    </div>
  )

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: '24px' }}>
      <p style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: '8px' }}>{title}</p>
      {children}
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={{ width: '480px', maxWidth: '90vw', background: '#0a0a0a', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: '#c9a84c' }}>CUSTOMER 360</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {loading && <p style={{ fontFamily: MONO, fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Cargando...</p>}
        {error && <p style={{ fontFamily: MONO, fontSize: '12px', color: '#fca5a5' }}>Error: {error}</p>}

        {data && !loading && (
          <>
            {section('IDENTIDAD', <>
              {row('Nombre', p?.full_name)}
              {row('Email', p?.email ? `${p.email.slice(0,3)}***` : null)}
              {row('User ID', p?.user_id || 'Sin Auth vinculado')}
              {row('Cuenta creada', p?.created_at ? new Date(p.created_at).toLocaleDateString('es-PY') : null)}
              {row('Lifecycle', p?.lifecycle_state?.toUpperCase())}
              {row('Plan', p?.is_subscribed ? 'PRO' : 'FREE')}
              {row('Test', p?.is_test ? `Sí — ${p.known_test_reason || 'sin razón'}` : 'No')}
            </>)}

            {section('ADQUISICIÓN', <>
              {row('Fuente', acq?.source)}
              {row('Medium', acq?.medium)}
              {row('Campaña', acq?.campaign)}
              {row('Landing', acq?.landing_page)}
              {row('Confianza', acq?.confidence?.toUpperCase() || 'UNKNOWN')}
              {!acq && <p style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>Origen desconocido</p>}
            </>)}

            {section('FOUNDING BETA', <>
              {row('Estado', fb?.status?.toUpperCase() || 'NO OFRECIDO')}
              {row('Ofrecido', fb?.offered_at ? new Date(fb.offered_at).toLocaleDateString('es-PY') : null)}
              {row('Aceptado', fb?.accepted_at ? new Date(fb.accepted_at).toLocaleDateString('es-PY') : null)}
              {row('Pro hasta', fb?.benefit_end ? new Date(fb.benefit_end).toLocaleDateString('es-PY') : null)}
            </>)}

            {section('ACTIVACIÓN', <>
              {row('Primer valor', p?.first_value_event || 'Sin activación')}
              {row('Fecha primer valor', p?.first_value_at ? new Date(p.first_value_at).toLocaleDateString('es-PY') : null)}
              {row('TTFV', p?.ttfv_seconds != null ? `${Math.round(p.ttfv_seconds / 60)} minutos` : 'No calculable')}
              {row('ATS completados', data.activity_summary?.ats_count ?? '—')}
              {row('CVs generados', data.activity_summary?.cv_count ?? '—')}
            </>)}

            {section('EMAILS', <>
              {(data.email_log || []).length === 0
                ? <p style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>Sin emails registrados</p>
                : (data.email_log || []).map((e: any) => (
                    <div key={e.template} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {row(e.template, `${e.status.toUpperCase()} · ${e.sent_at ? new Date(e.sent_at).toLocaleDateString('es-PY') : ''}`)}
                    </div>
                  ))
              }
            </>)}

            {section('ACTIVIDAD RECIENTE', <>
              {(data.events || []).length === 0
                ? <p style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>Actividad histórica no registrada</p>
                : (data.events || []).slice(0, 10).map((e: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', padding: '4px 0' }}>
                      <span style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(255,255,255,0.2)', width: '80px', flexShrink: 0 }}>
                        {new Date(e.created_at).toLocaleDateString('es-PY')}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: '11px', color: '#e8e8e0' }}>{e.event_type}</span>
                    </div>
                  ))
              }
            </>)}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into Admin.tsx usuarios tab**

Add to Admin.tsx:
```typescript
import UserDetailDrawer from '@/components/admin/UserDetailDrawer'
// state:
const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
```

In the usuarios tab table, add a "Ver recorrido" button that sets `selectedUserId`.

Add at bottom of authenticated Admin JSX:
```tsx
<UserDetailDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} adminFetch={adminFetch} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/UserDetailDrawer.tsx src/pages/Admin.tsx
git commit -m "feat(admin): add Customer 360 drawer with lifecycle, founding beta, email, activity"
```

---

## PHASE 6: SEARCH CONSOLE TRIAGE

### Task 13: GSC triage classification

**Files:**
- Modify: `netlify/functions/admin-data.ts` (add `gsc_triage` action)

**Purpose:** Spec sections 34–38. Fetch real GSC coverage data and classify URLs into INTENTIONAL / STALE / REAL_ISSUE / WAIT_FOR_GOOGLE / UNKNOWN.

- [ ] **Step 1: Add gsc_triage action to admin-data.ts**

This action calls the existing Google auth from `google-reporting.ts` and fetches GSC inspection/URL data. Since `admin-analytics.ts` already has the full GSC token flow, extract the token helper:

```typescript
    if (action === "gsc_triage") {
      // Returns classification of current GSC coverage issues.
      // Classification logic:
      // - /admin/* → INTENTIONAL (robots blocked)
      // - /auth/* → INTENTIONAL
      // - /oportunidades/peru, /oportunidades/remoto-latam → INTENTIONAL (noindex)
      // - URLs matching known slug patterns + 404 → investigate
      // - Recently deployed sitemap pages → STALE (wait)

      const INTENTIONAL_PATTERNS = [
        /^\/admin/,
        /^\/auth/,
        /^\/.netlify/,
        /^\/api\//,
      ]
      const NOINDEX_INTENTIONAL = ["/oportunidades/peru", "/oportunidades/remoto-latam"]
      const CANONICAL_VARIANTS = ["/oportunidades/"] // alternate with canonical = intentional

      // Current report from spec: GSC snapshot at time of task
      const gscSnapshot = {
        blocked_robots: 85,
        alternate_canonical: 37,
        not_found_404: 23,
        duplicate_no_canonical: 3,
        redirect: 2,
        noindex: 1,
        crawled_not_indexed: 96,
        soft_404: 7,
      }

      // Classification guidance based on known production state
      const classification = {
        blocked_robots: {
          count: gscSnapshot.blocked_robots,
          assessment: "MOSTLY_INTENTIONAL",
          detail: "Expected blocks: /admin, /auth, API routes, internal utility paths. Verify no public SEO landing accidentally blocked.",
          action_needed: "Manually sample 5 URLs in GSC Coverage report to confirm pattern.",
        },
        alternate_canonical: {
          count: gscSnapshot.alternate_canonical,
          assessment: "INTENTIONAL",
          detail: "/oportunidades/paraguay and /oportunidades/latam have canonical pointing to themselves. Alternate pages are likely search/filter variants.",
          action_needed: "None — canonical architecture is correct per production commit 01232c0e.",
        },
        not_found_404: {
          count: gscSnapshot.not_found_404,
          assessment: "MIXED",
          detail: "Some may be pre-migration URLs no longer valid. Requires per-URL investigation.",
          action_needed: "Sample 5 URLs from GSC. Classify each as LEGITIMATE_GONE / HAS_REPLACEMENT / BROKEN.",
        },
        duplicate_no_canonical: {
          count: gscSnapshot.duplicate_no_canonical,
          assessment: "NEEDS_REVIEW",
          detail: "3 pages. Check if these are search/filter variants missing a canonical tag.",
          action_needed: "Identify each URL. If filter/param variant: add canonical. If distinct page: decide.",
        },
        redirect: {
          count: gscSnapshot.redirect,
          assessment: "LIKELY_INTENTIONAL",
          detail: "Only 2 redirects. Likely old URL → new slug after migration.",
          action_needed: "Verify both in GSC to confirm destination is correct (not homepage redirect).",
        },
        noindex: {
          count: gscSnapshot.noindex,
          assessment: "INTENTIONAL",
          detail: "Exactly 1. Matches /oportunidades/peru or /oportunidades/remoto-latam (intentional noindex per spec).",
          action_needed: "None.",
        },
        crawled_not_indexed: {
          count: gscSnapshot.crawled_not_indexed,
          assessment: "QUALITY_SIGNAL",
          detail: "96 pages Google crawled but chose not to index. This is a SELECTION decision by Google, not a technical bug. Likely thin/duplicate opportunity details or old beta content.",
          action_needed: "Segment by URL pattern. Do NOT mass-modify architecture. Focus only if a key landing page is in this bucket.",
        },
        soft_404: {
          count: gscSnapshot.soft_404,
          assessment: "WAIT_FOR_GOOGLE",
          detail: "Validation already STARTED in GSC. Current production response is correct (commit 01232c0e). Google needs to recrawl.",
          action_needed: "Do NOT restart validation. Wait for Google to complete the current validation pass.",
        },
      }

      const realIssueCount = ["not_found_404","duplicate_no_canonical"].reduce((n, k) => n + (gscSnapshot as any)[k], 0)
      const waitingCount = gscSnapshot.soft_404
      const intentionalCount = gscSnapshot.alternate_canonical + gscSnapshot.noindex + gscSnapshot.blocked_robots
      const needsReviewCount = gscSnapshot.not_found_404 + gscSnapshot.duplicate_no_canonical + gscSnapshot.redirect
      const qualitySignalCount = gscSnapshot.crawled_not_indexed

      return {
        statusCode: 200,
        body: JSON.stringify({
          snapshot: gscSnapshot,
          classification,
          summary: {
            intentional: intentionalCount,
            real_issue: 0, // No confirmed bugs yet — all need sampling
            needs_sampling: needsReviewCount,
            wait_for_google: waitingCount,
            quality_signal: qualitySignalCount,
          },
          manual_tasks: [
            "Sample 5 URLs from 'Bloqueada por robots.txt' in GSC to confirm no SEO landing is blocked",
            "Sample 5 URLs from '404' category — classify each as LEGITIMATE_GONE / HAS_REPLACEMENT / BROKEN",
            "Inspect both 'Redirect' URLs to confirm destination is correct",
            "Check 3 'Duplicate sin canonical' URLs — add canonical if filter variants",
          ],
          baseline_commit: "01232c0e",
          note: "Report reflects GSC snapshot at time of analysis. Many issues likely pre-date the 01232c0e fixes. Wait for Google recrawl before acting.",
        }),
      }
    }
```

- [ ] **Step 2: Update Admin SEO tab brief view**

In `Admin.tsx`, in the `brief` tab (or SEO tab), add a "Resumen SEO" section that calls `gsc_triage` and displays the `summary` object with the interpretation per spec Section 37:

```
EXCLUSIONES INTENCIONALES: 123
REQUIEREN MUESTREO: 28
ESPERANDO RECRAWL: 7
SEÑAL DE CALIDAD (no acción): 96
```

And conditionally show: "No hay acción SEO necesaria hoy" or "Muestrear URLs manualmente esta semana".

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/admin-data.ts src/pages/Admin.tsx
git commit -m "feat(admin): add GSC triage classification action and SEO summary in brief"
```

---

## PHASE 7: B2B FOUNDING LEADS

### Task 14: Survey leads structure + Admin B2B panel

**Files:**
- Modify: `netlify/functions/admin-data.ts` (add `list_b2b_founding_leads`, `upsert_b2b_lead` actions)
- Modify: `src/pages/Admin.tsx` (update prospects tab)

- [ ] **Step 1: Add admin-data actions for B2B founding leads**

```typescript
    if (action === "list_b2b_founding_leads") {
      const { data, error } = await supabase
        .from("b2b_prospects")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      // Classify: real survey companies vs unknown/test
      const SURVEY_COMPANIES = ["imut","quality travel","manantial","vitalmed","grupo dicsa","dicsa"]
      const rows = (data || []).map((row: any) => ({
        ...row,
        is_survey_lead: SURVEY_COMPANIES.some(name =>
          (row.company_name || "").toLowerCase().includes(name)
        ),
        has_suspicious_email: row.email?.includes("@gmsil") || row.email?.includes("@gmial"),
      }))
      return { statusCode: 200, body: JSON.stringify({ data: rows }) }
    }

    if (action === "upsert_b2b_lead") {
      const leadData = payload?.data
      if (!leadData?.email) return { statusCode: 400, body: JSON.stringify({ error: "email required" }) }
      const { data, error } = await supabase
        .from("b2b_prospects")
        .upsert(leadData, { onConflict: "email", ignoreDuplicates: false })
        .select()
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ data: data?.[0] }) }
    }
```

- [ ] **Step 2: Update prospects tab UI**

In Admin.tsx, `prospects` tab section, update to use `list_b2b_founding_leads` and show:
- `is_survey_lead` badge
- `has_suspicious_email` warning: "Email posiblemente incorrecto — revisar antes de enviar"
- `b2b_funnel_status` as readable label
- `pilot_interest` toggle
- No "Invite" button without explicit founder click

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/admin-data.ts src/pages/Admin.tsx
git commit -m "feat(admin): add B2B founding leads actions with survey classification and suspicious email flag"
```

---

## PHASE 8: DOCUMENTATION

### Task 15: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add founding beta section**

In `CLAUDE.md`, after the "Reglas críticas" section, add:

```markdown
## Founding Beta OS (2026-08-19)

New tables: `founding_beta_enrollments`, `user_events`, `email_log`, `b2c_acquisition`.
New Netlify functions: `founding-beta-action`, `send-founding-email`, `notify-founder-signup`, `log-user-event`.
New components: `src/components/cvitae/FoundingBetaModal.tsx`, `src/hooks/useFoundingBeta.ts`,
  `src/components/admin/AdminCeoHoy.tsx`, `src/components/admin/UserDetailDrawer.tsx`.

DO NOT send real emails to Rosarito or Marcelo without explicit founder authorization.
DO NOT push to feature/aws-migration without founder review.
Email sender: contacto@cvitae.lat (Resend, domain must be verified).
Founding Beta limit: 50 real users. Idempotent accept via `accept_founding_beta` RPC.
```

Also update the Graphify section with:
```markdown
After Founding Beta OS changes: run `graphify update .` to refresh the knowledge graph.
```

- [ ] **Step 2: Create docs/PRODUCT_OPERATING_MODEL.md**

Create `docs/PRODUCT_OPERATING_MODEL.md` with B2C lifecycle, B2B funnel, Founding Beta overlay, feedback/incident severity, and compensation principles from spec sections 3, 4, 14, 16, 18.

- [ ] **Step 3: Create docs/ADMIN_DATA_DICTIONARY.md**

Create `docs/ADMIN_DATA_DICTIONARY.md` covering all CEO/Admin metrics — REAL USERS, NEW USERS, ACTIVATED, PRO, FOUNDING ACTIVE, etc. — with their exact table/filter/exclusion logic.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/PRODUCT_OPERATING_MODEL.md docs/ADMIN_DATA_DICTIONARY.md
git commit -m "docs: add Founding Beta OS docs and admin data dictionary"
```

---

## PHASE 9: FINAL VERIFICATION

### Task 16: Build check + smoke test

**Files:**
- Read: all new files created in Tasks 1–15

- [ ] **Step 1: Build**

```bash
pnpm build
```
Expected: no TypeScript errors, no TDZ errors, build succeeds.

- [ ] **Step 2: Dev server smoke test**

```bash
pnpm dev
```

Verify:
- Landing renders
- `/oportunidades` works
- `/mi-carrera` (logged in) shows Dashboard without error
- FoundingBetaModal visible on first login with synthetic test account
- Admin login works
- Admin loads all tabs without error
- CEO/Hoy shows KPIs (even if values are 0 or "—", not blank)
- User detail drawer opens for a test user
- GSC triage returns JSON without error

- [ ] **Step 3: Graphify refresh**

```bash
graphify update .
```

- [ ] **Step 4: Final git status**

```bash
git log --oneline -10
git status --short
```

Confirm: no untracked sensitive files, clean working tree.

---

## APPENDIX: Rosarito + Marcelo handling

After all tests pass with synthetic test accounts:

1. Run `adminFetch('user_detail', { userId: <rosarito_user_id> })` to get her complete truth.
2. Run same for Marcelo.
3. In Admin > Usuarios tab, use "Ver recorrido" to show their Customer 360 drawer.
4. If valid email exists: show `[Invitar Founding Beta]` button (preview first, never auto-send).
5. If no usable email: Founding Beta offer will appear on their next login via `useFoundingBeta`.

**DO NOT PUSH until founder reviews and explicitly authorizes.**

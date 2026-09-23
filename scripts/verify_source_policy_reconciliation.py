"""Offline contract for atomic hard-dead source policy reconciliation."""
from pathlib import Path
from unittest.mock import patch
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers")); sys.path.insert(0, str(ROOT / "scripts"))
from source_policy import classify_source_policy, is_hard_dead
import run_source_policy_reconciliation as reconciliation


def row(**changes):
    return {"id": "fixture", "source": "unjobs", "updated_at": "2026-09-13T00:00:00+00:00", "catalog_eligible": True, "match_eligible": True, **changes}


def observation(status: str, http_status: int, **changes):
    return {"id": "observation", "identity_status": status, "http_status": http_status, **changes}


removed = classify_source_policy(row(), observation("REMOVED", 410))
assert removed.action == "SUPPRESS" and removed.would_change == ["catalog_eligible", "match_eligible"]
dead = classify_source_policy(row(), observation("DEAD", 404))
assert dead.action == "SUPPRESS" and is_hard_dead(observation("DEAD", 404))
assert classify_source_policy(row(), observation("IDENTITY_UNRESOLVED", 0)).action == "NOOP"
assert classify_source_policy(row(), observation("IDENTITY_MISMATCH", 200)).action == "NOOP"
assert classify_source_policy(row(), observation("IDENTITY_UNRESOLVED", 500)).reasons == ["network_or_transient"]
assert classify_source_policy(row(), observation("IDENTITY_CONFIRMED", 200)).reasons == ["latest_live"]
restore = classify_source_policy(row(catalog_eligible=False, match_eligible=False), observation("IDENTITY_CONFIRMED", 200), previously_suppressed=True)
assert restore.action == "RESTORE" and restore.would_change == []
assert classify_source_policy(row(catalog_eligible=False, match_eligible=False), observation("IDENTITY_CONFIRMED", 200)).action == "NOOP"
assert classify_source_policy(row(catalog_eligible=False, match_eligible=False), observation("REMOVED", 410)).reasons[-1] == "already_suppressed"

# Latest-only behavior: a newer confirmed 200 supersedes an older 410.
assert classify_source_policy(row(), observation("IDENTITY_CONFIRMED", 200, id="new")).action == "NOOP"

metrics = reconciliation.metrics_for([removed, dead, classify_source_policy(row(catalog_eligible=False, match_eligible=False), observation("REMOVED", 410)), classify_source_policy(row(), observation("IDENTITY_CONFIRMED", 200)), classify_source_policy(row(), observation("IDENTITY_UNRESOLVED", 0))])
assert metrics["hard_dead"] == 3 and metrics["eligible_for_suppression"] == 2 and metrics["already_suppressed"] == 1
assert metrics["latest_live"] == 1 and metrics["network_or_transient"] == 1

class Response:
    status_code = 200
    def raise_for_status(self): pass
    def json(self): return [{"id": "new", "opportunity_id": "fixture", "identity_status": "IDENTITY_CONFIRMED", "http_status": 200, "observed_at": "2026-09-13T00:00:00+00:00"}, {"id": "old", "opportunity_id": "fixture", "identity_status": "REMOVED", "http_status": 410, "observed_at": "2026-09-12T00:00:00+00:00"}]

os.environ["SUPABASE_URL"] = "https://fixture.supabase.co"; os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "fixture"
with patch.object(reconciliation.requests, "get", return_value=Response()):
    latest = reconciliation.latest_observations("unjobs", ["fixture"])
assert latest["fixture"]["id"] == "new"

class PolicyResponse(Response):
    def json(self): return [{"opportunity_id": "fixture", "action": "SUPPRESS", "created_at": "2026-09-12T00:00:00+00:00", "id": "policy"}]

with patch.object(reconciliation.requests, "get", return_value=PolicyResponse()):
    policy_actions = reconciliation.latest_policy_actions("unjobs", ["fixture"])
assert policy_actions == {"fixture": "SUPPRESS"}
assert classify_source_policy(row(catalog_eligible=False, match_eligible=False), observation("IDENTITY_CONFIRMED", 200), previously_suppressed=policy_actions["fixture"] == "SUPPRESS").action == "RESTORE"

class Session:
    def __init__(self): self.calls = []
    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return Response()

session = Session()
result = reconciliation.SourcePolicyApplier(session).apply(row(), removed)
assert result[0]["id"] == "new" and session.calls[0][0].endswith("/rpc/apply_source_policy_suppression_atomic")
assert session.calls[0][1]["json"] == {"p_opportunity_id": "fixture", "p_source": "unjobs", "p_expected_updated_at": "2026-09-13T00:00:00+00:00"}
session_restore = Session()
reconciliation.SourcePolicyApplier(session_restore).apply(row(catalog_eligible=False, match_eligible=False), restore)
assert session_restore.calls[0][0].endswith("/rpc/apply_source_policy_restore_atomic")
assert classify_source_policy(row(catalog_eligible=False, match_eligible=False), observation("IDENTITY_CONFIRMED", 429), previously_suppressed=True).action == "NOOP"
assert classify_source_policy(row(catalog_eligible=False, match_eligible=False), observation("IDENTITY_CONFIRMED", 0), previously_suppressed=True).action == "NOOP"

migration = (ROOT / "supabase" / "migrations" / "202609130002_opportunity_source_policy_events.sql").read_text(encoding="utf-8").lower()
assert "create table if not exists public.opportunity_source_policy_events" in migration
assert "security definer" in migration and "for update" in migration
assert "order by observed_at desc, id desc" in migration and "http_status not in (404, 410)" in migration
assert "set catalog_eligible = false" in migration and "match_eligible = false" in migration
assert "insert into public.opportunity_source_policy_events" in migration
assert "revoke all on table public.opportunity_source_policy_events from public, anon, authenticated, service_role" in migration
assert "grant select, insert on table public.opportunity_source_policy_events to service_role" in migration
assert "revoke all on function public.apply_source_policy_suppression_atomic(text, text, timestamptz) from public, anon, authenticated, service_role" in migration
assert "update public.opportunities" not in (ROOT / "scripts" / "run_source_policy_reconciliation.py").read_text(encoding="utf-8").lower()
restore_migration = (ROOT / "supabase" / "migrations" / "202609130003_opportunity_source_policy_restore.sql").read_text(encoding="utf-8").lower()
assert "apply_source_policy_restore_atomic" in restore_migration and "identity_confirmed" in restore_migration
assert "catalog_eligible = true" not in restore_migration and "match_eligible = true" not in restore_migration
print("PASS source policy reconciliation: hard-dead latest-only, exclusions, idempotence, RPC-only atomic audit contract")

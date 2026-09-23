"""Offline invariant checks for the Registry V2 durable projection."""
from __future__ import annotations
import json, os, sys
from dataclasses import replace
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/"scrapers")); sys.path.insert(0,str(ROOT/"scripts"))
os.environ.setdefault("SUPABASE_URL", "https://example.test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fixture")
from source_cleaners import PROFILES
from source_registry_v2 import runtime_projection
from sync_source_registry_projection import PRODUCTION_TARGET_FILE, diff_projection, apply, projection_inventory, target_identity

p=PROFILES["himalayas"]
baseline=runtime_projection(p)
assert runtime_projection(p)["registry_policy_hash"]==baseline["registry_policy_hash"]
assert runtime_projection(replace(p, auto_enabled=not p.auto_enabled))["registry_policy_hash"]!=baseline["registry_policy_hash"]
assert runtime_projection(replace(p, certification=tuple(item for item in p.certification if item != "live_validation")))["registry_policy_hash"]!=baseline["registry_policy_hash"]
assert runtime_projection(replace(p, semantic_version=p.semantic_version+":changed"))["registry_policy_hash"]!=baseline["registry_policy_hash"]
assert runtime_projection(replace(p, google_jobs_distribution_allowed=not p.google_jobs_distribution_allowed))["registry_policy_hash"]!=baseline["registry_policy_hash"]
assert "registry_synced_at" not in baseline
fresh=datetime.now(timezone.utc).isoformat()
assert diff_projection({**baseline,"registry_synced_at":fresh},{**baseline,"registry_synced_at":"new"})=={}
assert "registry_synced_at" in diff_projection({**baseline,"registry_synced_at":"invalid"},{**baseline,"registry_synced_at":"new"})
assert baseline["registry_auto_enabled"] is False
assert baseline["google_jobs_distribution_allowed"] is False
assert baseline["registry_automation_policy_version"] == "opportunity_automation:v1"
assert baseline["registry_projection_ttl_hours"] != baseline["registry_health_ttl_hours"]
os.environ["SUPABASE_URL"]="http://127.0.0.1:54321"
assert target_identity("local")["mode"]=="LOCAL"
try: target_identity("production"); raise AssertionError("localhost must never pass production identity")
except RuntimeError: pass
os.environ["SUPABASE_URL"]="https://project.example.supabase.co"
try: target_identity("production"); raise AssertionError("unconfigured project must fail production identity")
except RuntimeError: pass
configured=json.loads(PRODUCTION_TARGET_FILE.read_text(encoding="utf-8"))
os.environ["SUPABASE_URL"]=f"https://{configured['supabase_host']}"
os.environ["CVITAE_PRODUCTION_SUPABASE_HOST"]="project.example.supabase.co"  # Must be ignored.
identity=target_identity("production")
assert identity["mode"]=="PRODUCTION" and identity["independent_identity_configured"] is True
os.environ["SUPABASE_URL"]="https://example.test"
class Session:
    def __init__(self): self.calls=[]
    def post(self,*args,**kwargs): self.calls.append(("POST",args,kwargs)); return type("R",(),{"raise_for_status":lambda self:None,"json":lambda self:[{}]})()
    def patch(self,*args,**kwargs): self.calls.append(("PATCH",args,kwargs)); return type("R",(),{"raise_for_status":lambda self:None,"json":lambda self:[{}]})()
desired={**baseline,"registry_synced_at":fresh}
session=Session(); outcome=apply([{"source":"new_source","action":"INSERT","desired":{**desired,"source":"new_source"}}],session=session)
assert outcome[0]["action"]=="INSERT" and session.calls[0][0]=="POST"
payload=session.calls[0][2]["json"]
assert payload["is_enabled"] is False and payload["trust_level"]=="review" and "registry_policy_hash" in payload
inventory=projection_inventory([
    {"source":"himalayas","action":"NOOP"},
    {"source":"new_source","action":"INSERT"},
], [{"source":"himalayas"},{"source":"legacy_source"}])
assert inventory["matching_canonical_profiles"]==1
assert inventory["legacy_or_noncanonical_sources"]==["legacy_source"]
assert inventory["missing_profile_sources"]==["new_source"]
try: apply([{"source":"dup","action":"UPDATE","desired":desired},{"source":"dup","action":"INSERT","desired":desired}],session=Session()); raise AssertionError("duplicate plan must fail before writes")
except RuntimeError as exc: assert str(exc)=="projection_plan_invalid_source_keys"
print("source registry durable projection verifier: PASS")

from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'scrapers'))
from opportunity_promotion_executor import PromotionRequest, AtomicPromotionExecutor

gate={"source_enabled":True,"certified":True,"auto_enabled":True,"health_fresh":True,"operational_health":"HEALTHY","distribution_allowed":False}
req=PromotionRequest("id","2026-09-14T00:00:00+00:00","opportunity_automation:v1","source-contract:v2","AUTO_PROMOTE",("READY_FOR_AUTO_PROMOTION",),{"verification":True,"activation":True,"catalog":True,"matching":True},gate,"registry-hash","idempotency-key","execution-1","scraper-run-1")
assert AtomicPromotionExecutor("https://example.test/rest/v1",{}).dry_run(req)["commit"] is False
assert "p_expected_registry_hash" in req.payload() and "p_idempotency_key" in req.payload()
for changed in ({"auto_enabled":False},{"operational_health":"DEGRADED"}):
    try: PromotionRequest(**{**req.__dict__,"runtime_gate_evidence":{**gate,**changed}}).validate(); raise AssertionError("must fail closed")
    except ValueError: pass
try: PromotionRequest(**{**req.__dict__,"allowed_actions":("google_jobs",)}).validate(); raise AssertionError("distribution denied")
except ValueError: pass
assert req.payload()["p_allowed_actions"]["catalog"] is True
assert PromotionRequest(**{**req.__dict__,"allowed_actions":{"catalog":False,"verification":True}}).payload()["p_allowed_actions"]["catalog"] is False
for invalid in ({"catalog":"true"},{"unknown":True},["catalog"]):
    try: PromotionRequest(**{**req.__dict__,"allowed_actions":invalid}).validate(); raise AssertionError("invalid action must fail")
    except ValueError: pass
print("verify_opportunity_promotion_executor: PASS")

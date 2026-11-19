"""Explicit atomic-promotion client. Dry-run by default; --apply is deliberate."""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/"scrapers"));sys.path.insert(0,str(ROOT/"scripts"))
from opportunity_promotion_executor import AtomicPromotionExecutor,PromotionRequest
from run_opportunity_enrichment_batch import api_base,api_headers,load_local_env

def main()->int:
 p=argparse.ArgumentParser(description=__doc__)
 for name in ("opportunity-id","expected-updated-at","registry-hash","semantic-version","policy-version","runtime-run-id","execution-id","idempotency-key"):
  p.add_argument("--"+name,required=True)
 p.add_argument("--actions",required=True,help='strict JSON object, e.g. {"verification":true,"activation":true}')
 p.add_argument("--reason",action="append",default=["READY_FOR_AUTO_PROMOTION"])
 p.add_argument("--apply",action="store_true")
 a=p.parse_args();load_local_env()
 try: actions=json.loads(a.actions)
 except json.JSONDecodeError:p.error("--actions must be JSON")
 request=PromotionRequest(a.opportunity_id,a.expected_updated_at,a.policy_version,a.semantic_version,"AUTO_PROMOTE",tuple(a.reason),actions,{"source_enabled":True,"certified":True,"auto_enabled":True,"health_fresh":True,"operational_health":"HEALTHY","distribution_allowed":False},a.registry_hash,a.idempotency_key,a.execution_id,a.runtime_run_id)
 executor=AtomicPromotionExecutor(api_base(),api_headers())
 result=executor.apply(request) if a.apply else executor.dry_run(request)
 print("CVITAE_ATOMIC_PROMOTION="+json.dumps(result,ensure_ascii=False,sort_keys=True,default=str));return 0
if __name__=="__main__":raise SystemExit(main())

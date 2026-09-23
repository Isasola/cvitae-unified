"""Bounded V2 Himalayas operational probe; writes only one scraper_runs record with --apply."""
from __future__ import annotations
import argparse,json,sys,time
from datetime import datetime,timezone
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/"scrapers"));sys.path.insert(0,str(ROOT/"scripts"))
from himalayas_scraper import ADAPTER_VERSION,fetch_api_inventory
from source_evidence import runtime_telemetry
from run_opportunity_enrichment_batch import api_base,api_headers,load_local_env

def probe(run_id:str,max_pages:int)->dict:
 started=datetime.now(timezone.utc);inventory=fetch_api_inventory(page_size=20,max_pages=max_pages,session=requests.Session());error=inventory.error
 health="HEALTHY" if not error or error in {"page_budget_reached","record_budget_reached","runtime_budget_reached"} else "DEGRADED"
 metrics=runtime_telemetry(provider_health=health,coverage_complete=inventory.complete,coverage_stop_reason="complete" if inventory.complete else error or "bounded",found=inventory.records_seen,valid=inventory.records_seen,processed=inventory.records_seen,rejected=0,rejection_reasons={},page_budget_reached=error=="page_budget_reached",runtime_budget_reached=error=="runtime_budget_reached",provider_error=error)
 return {"run_id":run_id,"scraper_id":"himalayas_scraper","scraper_name":"Himalayas V2 health probe","script_path":"scripts/run_himalayas_health_probe.py","trigger_type":"manual","status":"healthy" if health=="HEALTHY" else "warning","exit_code":0,"found_count":inventory.records_seen,"inserted_count":0,"warning_count":0,"error_count":0 if health=="HEALTHY" else 1,"error_summary":error,"started_at":started.isoformat(),"finished_at":datetime.now(timezone.utc).isoformat(),"duration_seconds":0,"adapter_version":ADAPTER_VERSION,"extraction_metrics":metrics}

def main()->int:
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("--run-id",required=True);p.add_argument("--max-pages",type=int,default=1);p.add_argument("--dry-run",action="store_true");p.add_argument("--apply",action="store_true");a=p.parse_args()
 if a.dry_run==a.apply:p.error("choose exactly one of --dry-run or --apply")
 if a.max_pages<1:p.error("--max-pages must be positive")
 load_local_env();payload=probe(a.run_id,a.max_pages)
 if a.apply:
  r=requests.post(f"{api_base()}/scraper_runs",headers={**api_headers(),"Prefer":"return=representation"},json=payload,timeout=30);r.raise_for_status();out={"mode":"APPLY","commit":True,"run":r.json()[0]}
 else:out={"mode":"DRY_RUN","commit":False,"run":payload}
 print("CVITAE_HIMALAYAS_HEALTH_PROBE="+json.dumps(out,ensure_ascii=False,sort_keys=True));return 0
if __name__=="__main__":raise SystemExit(main())

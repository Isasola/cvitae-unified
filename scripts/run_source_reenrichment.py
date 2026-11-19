"""Bounded, read-only DB-vs-current-detail re-enrichment planner.

No update path exists here: it is deliberately evidence/planning only.
"""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
from typing import Any
import requests
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/"scrapers"));sys.path.insert(0,str(ROOT/"scripts"))
from run_opportunity_enrichment_batch import api_base,api_headers,load_local_env

PARSERS={
 "talentcom":("talentcom_scraper","parse_talent_detail"),
 "unjobs":("unjobs_scraper","parse_unjobs_detail"),
 "weworkremotely":("weworkremotely_scraper","parse_wwr_detail"),
}

def _parser(source:str):
 import importlib
 module,name=PARSERS[source]; return getattr(importlib.import_module(module),name)

def _classify(row:dict[str,Any], detail:Any)->str:
 old=len(str(row.get("description") or "").strip()); status=getattr(detail,"source_status",0) or 0; new=len(str(getattr(detail,"description",None) or "").strip())
 if status in {404,410}: return "DETAIL_DEAD"
 if status != 200: return "DETAIL_UNAVAILABLE"
 if old < 80 and new >= 80: return "HISTORICAL_INGESTION_DEBT"
 if old >= 80 and new < 80: return "CURRENT_EXTRACTION_GAP"
 if old < 80 and new < 80: return "GENUINELY_SHORT_SOURCE"
 return "THRESHOLD_FALSE_POSITIVE"

def run(source:str,reason:str,limit:int,session:requests.Session|None=None)->dict[str,Any]:
 if source not in PARSERS: raise ValueError(f"unsupported_source:{source}")
 session=session or requests.Session(); parser=_parser(source)
 response=session.get(f"{api_base()}/opportunities",headers=api_headers(),params={"select":"id,source,source_url,application_url,description,content_fingerprint,semantic_fingerprint,updated_at","source":f"eq.{source}","deleted_at":"is.null","archived_at":"is.null","order":"updated_at.asc,id.asc","limit":str(limit)},timeout=30);response.raise_for_status()
 selected=[r for r in response.json() if reason!="CONTENT_INSUFFICIENT" or len(str(r.get("description") or "").strip())<80]
 rows=[]; counts={}
 for row in selected:
  url=row.get("source_url") or row.get("application_url")
  if not url: classification="DETAIL_UNAVAILABLE"; detail=None
  else:
   detail=parser(url,session=session);classification=_classify(row,detail)
  counts[classification]=counts.get(classification,0)+1
  rows.append({"id":row["id"],"url":url,"db_description_length":len(str(row.get("description") or "").strip()),"current_description_length":len(str(getattr(detail,"description",None) or "").strip()) if detail else 0,"source_status":getattr(detail,"source_status",None) if detail else None,"classification":classification,"proposed_content_fingerprint_change":bool(detail and getattr(detail,"description",None) and getattr(detail,"description",None)!=row.get("description"))})
 return {"source":source,"reason":reason,"mode":"DRY_RUN","commit":False,"selected":len(selected),"classification":counts,"rows":rows[:10]}

def main()->int:
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("--source",required=True,choices=sorted(PARSERS));p.add_argument("--reason",default="CONTENT_INSUFFICIENT");p.add_argument("--limit",type=int,default=20);p.add_argument("--dry-run",action="store_true");a=p.parse_args()
 if not a.dry_run:p.error("read-only planner; pass --dry-run")
 load_local_env();print("CVITAE_SOURCE_REENRICHMENT_PLAN="+json.dumps(run(a.source,a.reason,a.limit),ensure_ascii=False,sort_keys=True));return 0
if __name__=="__main__":raise SystemExit(main())

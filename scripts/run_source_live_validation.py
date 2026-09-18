"""Bounded live, read-only semantic validation for WWR and Talent detail pages."""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/"scrapers"))

def wwr(limit:int,session:requests.Session)->dict:
 from weworkremotely_scraper import BASE_RSS,CATEGORIES,parse_feed,rss_job,parse_wwr_detail
 discovered=[]
 for slug,rubro in CATEGORIES:
  for item in parse_feed(BASE_RSS.format(slug)):
   job=rss_job(item,rubro)
   if job and job["url"] not in {x["url"] for x in discovered}:discovered.append(job)
   if len(discovered)>=limit:break
  if len(discovered)>=limit:break
 details=[parse_wwr_detail(row["url"],row,session=session) for row in discovered]
 return _summary("weworkremotely",details,discovered)

def talent(limit:int,session:requests.Session)->dict:
 from talentcom_scraper import SEARCHES,fetch_page,parse_jobs,parse_talent_detail
 discovered=[]
 for keywords,location,rubro in SEARCHES:
  for row in parse_jobs(fetch_page(keywords,location),rubro,location):
   if row["application_url"] not in {x["application_url"] for x in discovered}: discovered.append(row)
   if len(discovered)>=limit:break
  if len(discovered)>=limit:break
 details=[parse_talent_detail(row["application_url"],session=session) for row in discovered]
 return _summary("talentcom",details,discovered)

def _summary(source,details,discovered):
 rows=[]
 for item in details:
  rows.append({"source_url":item.source_url,"canonical_url":item.canonical_url,"native_id":item.source_native_id,"http_status":item.source_status,"title":item.title,"description_length":len(item.description or ""),"remote_scope":item.remote_scope,"eligible_countries":item.eligible_countries,"eligible_regions":item.eligible_regions,"country_code":item.country_code,"onsite_country":item.onsite_country,"identity_valid":bool(item.source_url and item.canonical_url and item.title),"ambiguous":item.recommendation=="HUMAN_REVIEW"})
 return {"source":source,"mode":"LIVE_READ_ONLY","commit":False,"records_sampled":len(discovered),"details_fetched":len(details),"identity_valid":sum(x["identity_valid"] for x in rows),"ambiguous":sum(x["ambiguous"] for x in rows),"invalid":sum(not x["identity_valid"] for x in rows),"rows":rows}

def main()->int:
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("--source",required=True,choices=("weworkremotely","talentcom"));p.add_argument("--limit",type=int,default=10);p.add_argument("--dry-run",action="store_true");a=p.parse_args()
 if not a.dry_run:p.error("validator is read-only; pass --dry-run")
 if a.limit<1:p.error("limit must be positive")
 result=(wwr if a.source=="weworkremotely" else talent)(a.limit,requests.Session());print("CVITAE_SOURCE_LIVE_VALIDATION="+json.dumps(result,ensure_ascii=False,sort_keys=True));return 0
if __name__=="__main__":raise SystemExit(main())

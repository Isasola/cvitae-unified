"""Jobicy API collector; jobGeo is applicant remote-location eligibility."""
from __future__ import annotations
import os, re, time
from typing import Any
import requests
from opportunity_sink import OpportunitySink
from source_adapters import AdapterResult, RunLineageWriter, clean, parse_applicant_eligibility, recommend

SUPABASE_URL=os.environ.get("SUPABASE_URL","https://rbrirxbjbmdxflzaxxzp.supabase.co"); SUPABASE_KEY=os.environ.get("SUPABASE_SERVICE_ROLE_KEY","")
API_URL="https://jobicy.com/api/v2/remote-jobs"; ADAPTER_VERSION="jobicy:v2.0.0"
INDUSTRIES=[("devops-sysadmin","Tecnología e IT"),("software-dev","Tecnología e IT"),("data-science","Tecnología e IT"),("design","Diseño"),("marketing","Marketing y Publicidad"),("sales","Ventas y Comercial"),("customer-support","Atención al Cliente"),("finance-legal","Banca y Finanzas"),("hr","Recursos Humanos"),("product","Producto"),("writing","Comunicación y Medios"),("business","Negocios")]

def strip_html(value: str | None) -> str: return clean(re.sub(r"<[^>]+>"," ",value or ""),12000) or ""

def adapt_jobicy_job(raw: dict[str, Any]) -> AdapterResult:
    """`jobGeo` is source-contract applicant eligibility, never workplace geo."""
    source_url=clean(raw.get("url"),2000) or ""; requirement=clean(raw.get("jobGeo"),1000)
    countries,regions,scope=parse_applicant_eligibility(requirement)
    result=AdapterResult(source="jobicy",adapter_version=ADAPTER_VERSION,source_url=source_url,source_native_id=str(raw.get("id") or "") or None,canonical_url=source_url,apply_url=source_url,title=clean(raw.get("jobTitle"),240),organization=clean(raw.get("companyName"),240),description=strip_html(raw.get("jobDescription")),remote=True,remote_scope="UNKNOWN",applicant_location_requirements=requirement,eligible_countries=countries,eligible_regions=regions,date_posted=clean(raw.get("pubDate"),64),extraction_method="jobicy_api",source_status=200,confidence=.98,evidence={"source_field":"jobGeo","jobGeo":requirement,"eligibility_scope":scope or "UNKNOWN","work_arrangement":"REMOTE_SOURCE_CONTRACT","job_geography":"NOT_DECLARED"})
    result.extracted_fields=[field for field,value in (("title",result.title),("organization",result.organization),("description",result.description),("remote",result.remote),("eligible_countries",countries),("eligible_regions",regions)) if value]
    result.missing_expected_fields=["job_geography"]
    return recommend(result)

def new_row_from_detail(detail: AdapterResult, rubro: str, tags: list[str]) -> dict[str, Any]:
    return {"title":detail.title,"organization":detail.organization,"description":detail.description,"remote":True,"remote_scope":"UNKNOWN","eligible_countries":detail.eligible_countries,"eligible_regions":detail.eligible_regions,"rubro":rubro,"type":"Remoto","published_at":detail.date_posted,"application_url":detail.apply_url,"source_url":detail.source_url,"source":"jobicy","is_active":True,"tags":tags[:8],"source_authority":"aggregator","original_source_verified":False}

def main() -> None:
    seen:set[str]=set(); details:list[AdapterResult]=[]; rows:list[dict[str,Any]]=[]
    for industry,rubro in INDUSTRIES:
        try: response=requests.get(API_URL,params={"count":50,"industry":industry},headers={"User-Agent":"Mozilla/5.0"},timeout=20); raw_jobs=response.json().get("jobs",[]) if response.status_code==200 else []
        except (requests.RequestException,ValueError): raw_jobs=[]
        for raw in raw_jobs:
            url=clean(raw.get("url"),2000)
            if not url or url in seen: continue
            seen.add(url); detail=adapt_jobicy_job(raw); tags=raw.get("jobIndustry") or []; tags=[tags] if isinstance(tags,str) else tags
            details.append(detail); rows.append(new_row_from_detail(detail,rubro,[str(tag).lower() for tag in tags]))
        time.sleep(1)
    summary=OpportunitySink().upsert(rows) if rows else None
    lineage=RunLineageWriter(SUPABASE_URL,SUPABASE_KEY).record(details) if SUPABASE_KEY else None
    print(f"Jobicy: {summary.to_dict() if summary else {}} lineage={lineage}")

if __name__=="__main__": main()

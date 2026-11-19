"""Read-only validator for one append-only source-observation execution."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from run_opportunity_enrichment_batch import api_base, api_headers, load_local_env

LIFECYCLE=("verification_status,is_active,catalog_eligible,match_eligible,alerts_eligible,seo_eligible,factory_status,embedding")

def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",required=True); parser.add_argument("--run-id",required=True)
    args=parser.parse_args(); load_local_env(); session=requests.Session()
    response=session.get(f"{api_base()}/opportunity_source_observations",headers=api_headers(),params={"select":"opportunity_id,identity_status,http_status,canonical_url,observed_at,run_id","source":f"eq.{args.source}","run_id":f"eq.{args.run_id}","order":"observed_at.asc"},timeout=30); response.raise_for_status(); rows=response.json()
    ids=sorted({str(row["opportunity_id"]) for row in rows}); opportunities=[]
    for start in range(0,len(ids),100):
        values=','.join(f'"{value}"' for value in ids[start:start+100])
        result=session.get(f"{api_base()}/opportunities",headers=api_headers(),params={"select":"id,source,"+LIFECYCLE,"id":f"in.({values})"},timeout=30); result.raise_for_status(); opportunities.extend(result.json())
    duplicate_equivalents=len(rows)-len({(r["opportunity_id"],r["identity_status"],r.get("http_status"),r.get("canonical_url")) for r in rows})
    output={"source":args.source,"run_id":args.run_id,"observations":len(rows),"opportunities_found":len(opportunities),"duplicate_equivalent_observations":duplicate_equivalents,"rows":rows[:10],"lifecycle_snapshot":opportunities[:10],"commit":False}
    print("CVITAE_OBSERVATION_RUN_VALIDATION="+json.dumps(output,ensure_ascii=False,sort_keys=True)); return 0
if __name__=="__main__": raise SystemExit(main())

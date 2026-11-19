import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scrapers"))
from greenhouse_scraper import fetch_board
from lever_scraper import fetch_site

class Response:
    def __init__(self,payload,status=200): self.payload=payload; self.status_code=status
    def raise_for_status(self):
        if self.status_code >= 400: raise RuntimeError(self.status_code)
    def json(self): return self.payload
class Session:
    def __init__(self,pages): self.pages=list(pages); self.calls=[]
    def get(self,url,**kwargs): self.calls.append((url,kwargs)); return Response(self.pages.pop(0))

gh=Session([{"jobs":[{"id":1,"title":"Project Coordinator","absolute_url":"https://boards.greenhouse.io/acme/jobs/1","location":{"name":"Bogotá"},"content":"<p>Coordinate regional projects, budgets, partners, monitoring and reporting.</p>"}],"meta":{"total":1}}])
rows,coverage=fetch_board({"token":"acme","employer":"Acme"},gh)
assert coverage=={"expected":1,"received":1,"complete":True} and rows[0]["source_native_id"]=="greenhouse:acme:1"
assert rows[0]["eligible_countries"]==[] and rows[0]["match_eligible"] is False and rows[0]["original_source_verified"] is False

page1=[{"id":str(i),"text":"Programme Officer","hostedUrl":f"https://jobs.lever.co/acme/{i}","applyUrl":f"https://jobs.lever.co/acme/{i}/apply","descriptionPlain":"Programme coordination, partnerships, monitoring and reporting.","country":"PY","workplaceType":"hybrid","categories":{"location":"Asunción","team":"Programs"}} for i in range(2)]
page2=[{"id":"2","text":"Project Manager","hostedUrl":"https://jobs.lever.co/acme/2","applyUrl":"https://jobs.lever.co/acme/2/apply","descriptionPlain":"Manage projects and coordinate stakeholders with documented outcomes.","country":None,"workplaceType":"remote","categories":{"location":"Remote","team":"Programs"}}]
lever=Session([page1,page2]); rows,coverage=fetch_site({"site":"acme","employer":"Acme","region":"global","delay_seconds":0},lever,page_size=2)
assert coverage=={"pages":2,"received":3,"complete":True}
assert [call[1]["params"]["skip"] for call in lever.calls]==[0,2]
assert rows[2]["remote"] is True and rows[2]["eligible_countries"]==[] and rows[2]["country_code"] is None
print("verify_ats_connectors: PASS greenhouse_complete lever_eof review_only eligibility_unknown")

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scrapers'))
from opportunity_sink import normalize_opportunity
raw={'title':'Global Fellowship 2027','organization':'OpportunityDesk','description':'Global Fellowship 2027','location':'Global','type':'Beca','application_url':'https://opportunitydesk.org/2027/fellowship','source':'opportunitydesk','tags':['beca']}
row, reason=normalize_opportunity(raw); assert row, reason
assert row['description']=='Global Fellowship 2027' and row['opportunity_type']=='scholarship'
print('verify_opportunitydesk_opportunity_truth: PASS')

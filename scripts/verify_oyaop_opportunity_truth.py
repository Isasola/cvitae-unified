import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scrapers'))
from opportunity_sink import normalize_opportunity
raw={'title':'International Opportunity','organization':'OYA Opportunities','description':'','location':'Global','type':'Oportunidad','application_url':'https://oyaop.com/item/1','source':'oyaop','tags':[]}
row, reason=normalize_opportunity(raw); assert row, reason
assert row['description']=='' and row['tags']==[] and row['opportunity_type']=='job'
# Thin card-only rows remain storable/catalog-reviewable but have no evidence
# that would justify automatic matching readiness.
assert len(row['description']) < 100 and not row['tags']
print('verify_oyaop_opportunity_truth: PASS')

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scrapers'))
from opportunity_sink import normalize_opportunity
raw={'title':'Backend Engineer','organization':'Acme','description':'Remote backend work with Python and APIs. '*8,'location':'Remote','remote':True,'remote_scope':'REGIONAL','eligible_countries':['BR'],'eligible_regions':['LATAM'],'type':'FULL_TIME','deadline':None,'application_url':'https://example.test/apply','source_url':'https://weworkremotely.com/job/1','source':'weworkremotely','tags':['python']}
row, reason=normalize_opportunity(raw); assert row, reason
assert row['remote_scope']=='REGIONAL' and row['eligible_countries']==['BR'] and row['type']=='FULL_TIME' and row['deadline'] is None
print('verify_weworkremotely_opportunity_truth: PASS')

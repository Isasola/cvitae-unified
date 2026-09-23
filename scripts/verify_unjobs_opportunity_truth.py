import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scrapers'))
from opportunity_sink import normalize_opportunity
raw={'title':'Programme Officer','organization':'UN Agency','description':'Responsibilities include programme delivery. Qualifications require international development experience. '*5,'location':'Asunción, Paraguay','country_code':'PY','eligible_countries':['PY'],'eligible_regions':['LATAM'],'remote':False,'type':'FIXED_TERM','deadline':'2027-01-01','application_url':'https://example.test/apply','source_url':'https://unjobs.org/vacancy/1','source':'unjobs','tags':['programme-management']}
row, reason=normalize_opportunity(raw); assert row, reason
assert len(row['description'])>100 and row['eligible_countries']==['PY'] and row['type']=='FIXED_TERM' and row['deadline']=='2027-01-01'
print('verify_unjobs_opportunity_truth: PASS')

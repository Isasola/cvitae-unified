import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scrapers'))
from eu_delegation_py_scraper import _parse_vacancies_page
from opportunity_sink import normalize_opportunity
html='<article><h2><a href="/eeas/programme-officer_es">Programme Officer</a></h2><p>Fecha límite: 15/09/2027. Requisitos y responsabilidades para Paraguay.</p></article>'
raw=_parse_vacancies_page(html)[0]; row, reason=normalize_opportunity(raw); assert row, reason
assert row['eligible_countries']==['PY'] and row['eligible_regions']==['PY'] and row['deadline']=='2027-09-15' and row['source_url']==row['application_url']
print('verify_eu_delegation_opportunity_truth: PASS')

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scrapers'))
from eu_delegation_py_scraper import _parse_vacancies_page
from opportunity_sink import normalize_opportunity
html='''<main>
<article><h2><a href="/breadcrumb-3fe1f40b/">Breadcrumb</a></h2><p>Breadcrumb</p></article>
<article><h2><a href="/eeas/programme-officer_es">Programme Officer</a></h2><p>Fecha límite: 15/09/2027. Coordinar programas, monitorear resultados y preparar informes para la delegación.</p></article>
</main>'''
parsed=_parse_vacancies_page(html)
assert len(parsed)==1 and parsed[0]['title']=='Programme Officer', parsed
raw=parsed[0]; row, reason=normalize_opportunity(raw); assert row, reason
assert row['eligible_countries']==[] and row['eligible_regions']==[], 'La ubicación PY no prueba elegibilidad del candidato'
assert row['original_source_verified'] is False, 'Una tarjeta de listado no verifica independientemente el detalle'
assert row['country_code']=='PY' and row['deadline']=='2027-09-15' and row['source_url']==row['application_url']
print('verify_eu_delegation_opportunity_truth: PASS')

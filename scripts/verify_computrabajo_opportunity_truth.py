import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT / 'scrapers'))
from computrabajo_scraper import parse_detail_html

def main():
    html = '''<script type="application/ld+json">{"@type":"JobPosting","description":"<p>Descripción real con requisitos y responsabilidades suficientemente detallados para el fixture de oportunidad.</p>","hiringOrganization":{"name":"Empresa PY"},"employmentType":"FULL_TIME","validThrough":"2027-01-01","skills":["Excel","Atención al cliente"],"baseSalary":{"currency":"PYG","value":{"value":3500000}}}</script>'''
    data = parse_detail_html(html)
    assert data['organization'] == 'Empresa PY' and len(data['description']) > 50
    assert data['employment_type'] == 'FULL_TIME' and data['deadline'] == '2027-01-01'
    assert data['currency'] == 'PYG' and data['skills'] == ['Excel', 'Atención al cliente']
    print('verify_computrabajo_opportunity_truth: PASS')
if __name__ == '__main__': main()

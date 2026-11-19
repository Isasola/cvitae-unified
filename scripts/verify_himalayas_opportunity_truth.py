import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT / 'scrapers'))
from himalayas_scraper import adapt_himalayas_job

def main():
    job = {'guid':'https://himalayas.app/jobs/acme-1','applicationLink':'https://acme.test/apply','title':'Data Engineer','companyName':'Acme','description':'Build reliable data pipelines for a distributed team.' * 3,'locationRestrictions':[{'alpha2':'BR','name':'Brazil'},{'alpha2':'MX','name':'Mexico'}],'timezoneRestrictions':['UTC-3'],'employmentType':'Full-time','minSalary':50000,'maxSalary':70000,'currency':'USD','salaryPeriod':'year','pubDate':'2026-09-20','expiryDate':'2026-12-01'}
    detail = adapt_himalayas_job(job)
    assert detail.location == 'Remote' and detail.remote is True and detail.remote_scope == 'REGIONAL'
    assert detail.eligible_countries == ['BR', 'MX'], 'remote must not become worldwide'
    assert detail.employment_type == 'Full-time' and detail.deadline == '2026-12-01'
    assert detail.salary_text and detail.currency == 'USD'
    print('verify_himalayas_opportunity_truth: PASS')
if __name__ == '__main__': main()

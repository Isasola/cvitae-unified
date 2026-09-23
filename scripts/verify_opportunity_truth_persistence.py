"""Offline evidence that priority-source detail truth survives Sink normalization."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from computrabajo_scraper import enrich_with_details, parse_detail_html
from himalayas_scraper import adapt_himalayas_job
from opportunity_sink import normalize_opportunity


def persisted(raw):
    row, reason = normalize_opportunity(raw)
    assert row is not None, reason
    return row


def computrabajo_payload():
    html = '''<script type="application/ld+json">{"@type":"JobPosting","description":"<p>Descripci\u00f3n real detallada con responsabilidades, requisitos, herramientas y condiciones verificables para este cargo.</p>","hiringOrganization":{"name":"Empresa PY"},"employmentType":"FULL_TIME","validThrough":"2027-01-01","skills":["Excel","Atenci\u00f3n al cliente"],"baseSalary":{"currency":"PYG","value":{"value":3500000}}}</script>'''
    detail = parse_detail_html(html)
    raw = {"title": "Analista comercial", "organization": "", "description": "", "location": "Asunci\u00f3n, Paraguay", "application_url": "https://example.test/apply", "source": "computrabajo", "tags": ["ventas"]}
    raw.update({"description": detail["description"], "organization": detail["organization"], "type": detail["employment_type"], "deadline": detail["deadline"], "value": detail["salary"], "currency": detail["currency"], "tags": list(dict.fromkeys(raw["tags"] + detail["skills"]))})
    row = persisted(raw)
    assert row["description"].startswith("Descripci") and row["organization"] == "Empresa PY"
    assert row["type"] == "FULL_TIME" and row["deadline"] == "2027-01-01"
    # ``value`` is the existing text column boundary; the monetary evidence
    # survives there without introducing a new database column.
    assert row["value"] == "3500000" and row["currency"] == "PYG"
    assert row["tags"] == ["ventas", "Excel", "Atenci\u00f3n al cliente"]
    assert row["application_url"] == "https://example.test/apply" and row["country_code"] == "PY"


def himalayas_payload():
    raw = {"guid":"https://himalayas.app/jobs/acme-1", "applicationLink":"https://acme.test/apply", "title":"Data Engineer", "companyName":"Acme", "description":"Build reliable data pipelines for a distributed team. " * 4, "locationRestrictions":[{"alpha2":"BR","name":"Brazil"},{"alpha2":"MX","name":"Mexico"}], "timezoneRestrictions":["UTC-3"], "employmentType":"Full-time", "minSalary":50000, "maxSalary":70000, "currency":"USD", "salaryPeriod":"year", "pubDate":"2026-09-20", "expiryDate":"2026-12-01", "categories":["Data"]}
    detail = adapt_himalayas_job(raw)
    row = persisted({"title": detail.title, "organization": detail.organization, "description": detail.description, "location": detail.location, "country_code": detail.country_code, "onsite_country": detail.onsite_country, "remote": detail.remote, "remote_scope": detail.remote_scope, "eligible_countries": detail.eligible_countries, "eligible_regions": detail.eligible_regions, "type": detail.employment_type, "value": detail.salary_text, "currency": detail.currency, "published_at": detail.date_posted, "deadline": detail.deadline, "application_url": detail.apply_url, "source": "himalayas", "tags":["data"]})
    assert row["organization"] == "Acme" and row["type"] == "Full-time" and row["deadline"] == "2026-12-01"
    assert row["remote"] is True and row["remote_scope"] == "REGIONAL"
    assert row["eligible_countries"] == ["BR", "MX"] and row["eligible_regions"] == []
    assert row["location"] == "Remote" and row["application_url"] == "https://acme.test/apply"


if __name__ == "__main__":
    computrabajo_payload(); himalayas_payload()
    print("verify_opportunity_truth_persistence: PASS")

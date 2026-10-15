"""Focused local contract smoke for the newly wired PY source adapters."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from prodato_scraper import parse_detail_identity, parse_listing, to_sink_row
from lizzy_castillo_scraper import parse_detail as parse_lizzy_detail, parse_listing as parse_lizzy_listing
from outsourcing_py_scraper import parse_detail as parse_outsourcing_detail, parse_listing as parse_outsourcing_listing
from smartrecruiters_scraper import normalize_posting, source_for_company
from source_cleaners.profiles import PROFILES
from source_registry_v2 import resolve_emitted_source
from opportunity_sink import OpportunitySink
import lever_scraper


def run() -> None:
    prodato_html = '''<html><body><main><h2>Vacantes disponibles</h2><span>1 resultados</span>
      <div class="grid"><div class="rounded-[24px]"><span>1 sept. 2026</span><p>RRHH</p>
        <h3>Analista de Nómina</h3><span>Tiempo completo</span><p>Asunción</p>
        <a href="/careers/42">Postularme</a></div>
      <div class="rounded-[24px]"><span>Búsqueda continua</span><h3>Banco de Talentos</h3>
        <a href="/careers/99">Postularme</a></div></div></main></body></html>'''
    listing = parse_listing(prodato_html)
    assert listing["reported_results"] == 1 and listing["eof_confirmed"]
    assert len(listing["job_postings"]) == 1 and listing["excluded_non_job"] == 1
    job = listing["job_postings"][0]
    assert job["native_id"] == "42" and job["published_at"].startswith("2026-09-01")
    detail = parse_detail_identity('<link rel="canonical" href="https://empleos.prodato.uk/careers/42"><main><h1>Analista de Nómina</h1></main>', "42", job["title"])
    assert detail["detail_title_confirmed"] and detail["native_id"] == "42"
    normalized = to_sink_row({**job, **detail})
    assert normalized["source"] == "prodato_direct" and normalized["is_active"] is False
    assert normalized["deadline"] is None and normalized["description"] is None

    lizzy_url = "https://seleccion.lizzycastillo.com.py/trabajo/jefe-de-seguridad-patrimonial/"
    lizzy_listing = parse_lizzy_listing(f'<a href="{lizzy_url}">Jefe de Seguridad Patrimonial</a>')
    assert len(lizzy_listing["postings"]) == 1 and not lizzy_listing["eof_confirmed"]
    lizzy_schema = {"@context": "https://schema.org", "@type": "JobPosting", "title": "Jefe de Seguridad Patrimonial",
                    "identifier": {"value": "https://seleccion.lizzycastillo.com.py/?post_type=job_listing&#038;p=1282"},
                    "datePosted": "2026-02-24T09:15:08-04:00", "validThrough": "2026-12-23T23:59:59-04:00",
                    "jobLocation": None, "hiringOrganization": {"name": ""}}
    lizzy_row = parse_lizzy_detail(
        f'<link rel="canonical" href="{lizzy_url}"><script type="application/ld+json">{json.dumps(lizzy_schema)}</script>'
        '<a href="https://seleccion.lizzycastillo.com.py/postular">Postularme</a>',
        lizzy_url, "Jefe de Seguridad Patrimonial", now=datetime(2026, 10, 15, tzinfo=timezone.utc))
    assert lizzy_row["source_native_id"] == "lizzy_castillo_py:1282"
    assert lizzy_row["evidence"]["source_lifecycle"] == "OPEN"
    assert lizzy_row["country_code"] is None and lizzy_row["eligible_countries"] == []
    assert lizzy_row["application_url"] == lizzy_url and lizzy_row["evidence"]["apply_route_is_generic"]
    assert lizzy_row["description"] is None and lizzy_row["verification_status"] == "in_review"
    assert resolve_emitted_source("lizzy_castillo_scraper").source == "lizzy_castillo_py"

    outsourcing_listing = parse_outsourcing_listing(
        '<h2>Vacantes Externas</h2><a href="/ficha-trabaja-con-nosotros?vacancy=1">Contador Público</a>'
        '<a href="/ficha-oportunidades-laborales?vacancy=2">Encargado de Recursos Humanos</a>')
    assert [row["native_id"] for row in outsourcing_listing["vacancies"]] == [1, 2]
    outsourcing_row = parse_outsourcing_detail('<main><h1>Contador Público</h1><h2>Información Personal</h2></main>',
                                               "https://outsourcing.com.py/ficha-trabaja-con-nosotros?vacancy=1")
    assert outsourcing_row["source_native_id"] == "outsourcing_paraguay:1"
    assert outsourcing_row["country_code"] is None and outsourcing_row["organization"] is None
    assert outsourcing_row["deadline"] is None and outsourcing_row["description"] is None
    assert outsourcing_row["is_active"] is False and "JOB_LOCATION_UNKNOWN" in outsourcing_row["verification_reasons"]
    assert resolve_emitted_source("outsourcing_py_scraper").source == "outsourcing_paraguay"

    tenant = {"company": "deliveryhero", "employer": "Delivery Hero / PedidosYa", "description_reuse_allowed": False}
    smart_listing = {"id": "744000153213538", "name": "Logistics Assistant", "releasedDate": "2026-10-02T15:09:26.740Z",
                     "location": {"city": "Asunción", "country": "py", "remote": False, "hybrid": True,
                                  "fullLocation": "Asunción, Paraguay"}}
    smart_detail = {**smart_listing, "jobAd": {"language": "es", "sections": [{"title": "Description", "text": "do not persist"}]}}
    smart = normalize_posting(tenant, smart_listing, smart_detail)
    assert source_for_company("deliveryhero") == "smartrecruiters_deliveryhero"
    assert smart["source_native_id"] == "smartrecruiters:deliveryhero:744000153213538"
    assert smart["country_code"] == "PY" and smart["eligible_countries"] == []
    assert smart["remote"] is False and smart["workplace_type"] == "HYBRID"
    assert smart["description"] is None and smart["deadline"] is None and not smart["is_active"]
    try:
        normalize_posting(tenant, smart_listing, {**smart_detail, "id": "wrong"})
    except ValueError as error:
        assert str(error) == "smartrecruiters_detail_identity_mismatch"
    else:
        raise AssertionError("SmartRecruiters tenant/native ID mismatch must fail closed")

    assert resolve_emitted_source("smartrecruiters_deliveryhero").source == "smartrecruiters_deliveryhero"
    assert resolve_emitted_source("prodato_scraper").source == "prodato_direct"
    assert PROFILES["smartrecruiters_deliveryhero"].auto_enabled is False
    assert PROFILES["prodato_direct"].auto_enabled is False
    lever_site = {"site": "bluelightconsulting", "market_scope": "PY_PRIMARY"}
    lever_scraper.validate_market_scope(lever_site, {"country_code": "PY"})
    try:
        lever_scraper.validate_market_scope(lever_site, {"country_code": "AR"})
    except RuntimeError as error:
        assert str(error) == "lever_canary_not_primary_py"
    else:
        raise AssertionError("Lever PY-primary canary must reject a different primary job country")
    assert lever_scraper.configured_sites() == []
    try:
        lever_scraper.configured_sites(["bluelightconsulting"])
    except ValueError as error:
        assert str(error) == "lever_production_tenant_not_enabled_and_review_approved:bluelightconsulting"
    else:
        raise AssertionError("Lever tenant must stay disabled until its exact review is approved")

    with tempfile.TemporaryDirectory() as temp:
        audit_path = str(Path(temp) / "sink.json")
        previous_audit = os.environ.get("CVITAE_AUDIT_MODE")
        previous_path = os.environ.get("CVITAE_AUDIT_OUTPUT")
        os.environ["CVITAE_AUDIT_MODE"] = "1"
        os.environ["CVITAE_AUDIT_OUTPUT"] = audit_path
        try:
            result = OpportunitySink().upsert([normalized, normalized, lizzy_row, outsourcing_row],
                adapter_version="py-source-expansion:test", cleaner_id="review-only-fixture")
        finally:
            if previous_audit is None:
                os.environ.pop("CVITAE_AUDIT_MODE", None)
            else:
                os.environ["CVITAE_AUDIT_MODE"] = previous_audit
            if previous_path is None:
                os.environ.pop("CVITAE_AUDIT_OUTPUT", None)
            else:
                os.environ["CVITAE_AUDIT_OUTPUT"] = previous_path
        payload = json.loads(Path(audit_path).read_text(encoding="utf-8"))
        assert result.found == 4 and result.duplicates_in_run == 1
        assert result.submitted == 0 and result.inserted == 0
        assert len(payload["sample"]) == 3
        assert {row["recruiter_vacancy_id"] for row in payload["sample"]} == {
            "prodato_direct:42", "lizzy_castillo_py:1282", "outsourcing_paraguay:1"}
    print("verify_py_source_expansion: PASS Prodato, Lizzy and Outsourcing identity/geography/expiry gates, SmartRecruiters tenant identity, Lever PY-primary canary, V2 aliases, Sink audit dedupe; no database writes")


if __name__ == "__main__":
    run()

"""Local create/update/no-op and provenance contract for the Remotive adapter."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from opportunity_sink import OpportunitySink, normalize_opportunity
from source_adapters import build_rpc_patch, eligibility_evidence_payload
import remotive_scraper as remotive

RAW = {
    "id": 123, "url": "https://remotive.com/remote-jobs/software-dev/fixture-123",
    "title": "Platform Engineer", "company_name": "Acme", "candidate_required_location": "United States only",
    "description": "<p>Build robust distributed systems with Python, SQL and documented operational ownership.</p>" * 3,
    "publication_date": "2026-09-27T12:00:00", "salary": "$100k",
}

detail = remotive.adapt_remotive_job(RAW)
assert detail.location is None and detail.country_code is None and detail.onsite_country is None
assert detail.remote is True and detail.remote_scope == "UNKNOWN"
assert detail.eligible_countries == ["US"] and detail.eligible_regions == []
assert detail.recommendation == "AUTO_PUBLISH"  # remote + declared applicant scope is routing-ready, not physical job geo.
evidence = eligibility_evidence_payload(detail)
envelope = evidence["eligibility_evidence_v1"]
assert envelope["applicant_location_requirements"] == "United States only"
assert envelope["eligible_countries"] == ["US"] and evidence["source_field"] == "candidate_required_location"

# CREATE: Sink accepts only normalized decision fields; no synthetic location.
created = remotive.new_row_from_detail(detail, "software-dev")
normalized, error = normalize_opportunity(created)
assert error is None and normalized is not None
assert normalized.get("location") in (None, "") and normalized["eligible_countries"] == ["US"]

# UPDATE / NO-OP: common adapter patch preserves explicit eligibility and has no
# changes when the persisted normalized values already agree.
patch = build_rpc_patch(detail, {"eligible_countries": [], "eligible_regions": [], "location": None})
assert patch["eligible_countries"] == ["US"] and "location" not in patch
persisted = build_rpc_patch(detail, {})
assert build_rpc_patch(detail, persisted) == {}

# Entry-point parity is structural and local: this source now imports and calls
# OpportunitySink directly, so it does not depend on sitecustomize interception.
source = (ROOT / "scrapers" / "remotive_scraper.py").read_text(encoding="utf-8")
assert "OpportunitySink().upsert(rows)" in source and "requests.post(" not in source

print("PASS verify_remotive_semantic_contract: adapter, create, update/no-op, provenance, direct-sink entrypoint")

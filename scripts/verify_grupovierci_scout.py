"""Local safety checks for the re-pointed Grupo Vierci scout."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from grupovierci_scraper import LISTING_URL, SOURCE_ID, main, parse_listing_page
from source_registry_v2 import resolve_emitted_source


def run() -> None:
    fixture = (ROOT / "scripts/fixtures/grupovierci/empty.html").read_text(encoding="utf-8")
    parsed = parse_listing_page(fixture)
    assert parsed == {"items": [], "eof": True, "empty_state": "EXPLICIT_NO_CURRENT_VACANCIES"}
    assert LISTING_URL == "https://empleo.grupovierci.com/vista_prueba.php"

    for html in (
        "<html><body><h1>Portal de empleos</h1></body></html>",
        "<html><body><div class='vacancy-card'>Título de vacante sin ID</div></body></html>",
    ):
        try:
            parse_listing_page(html)
            raise AssertionError("unknown or posting-like markup must not become an empty EOF or a job")
        except Exception as exc:
            assert type(exc).__name__ in {"UnexpectedMarkup", "UpstreamFailure"}

    with patch.dict(os.environ, {"CVITAE_GRUPO_VIERCI_FEED_AUTHORIZED": "false"}), patch("requests.Session", side_effect=AssertionError("authorization gate must precede HTTP")), patch.object(sys, "argv", ["grupovierci_scraper"]):
        assert main() == 2

    code = (ROOT / "scrapers/grupovierci_scraper.py").read_text(encoding="utf-8")
    assert "requests.post" not in code and "verify=False" not in code
    assert resolve_emitted_source("grupo_vierci").source == "grupovierci"
    registry = json.loads((ROOT / "scrapers/source_registry.json").read_text(encoding="utf-8"))
    source = next(row for row in registry["sources"] if row["source_id"] == "grupovierci")
    assert source["collection_enabled"] is False and source["require_review"] is True
    assert all(source[key] is False for key in ("catalog_enabled", "matching_enabled", "alerts_enabled", "seo_enabled"))
    legacy = (ROOT / ".github/workflows/scrapers.yml").read_text(encoding="utf-8")
    assert "vars.CVITAE_GRUPO_VIERCI_FEED_AUTHORIZED == 'true'" in legacy
    print("verify_grupovierci_scout: PASS explicit-empty fixture, fail-closed unknown markup, no direct PROD writer, source gate OFF")


if __name__ == "__main__":
    run()

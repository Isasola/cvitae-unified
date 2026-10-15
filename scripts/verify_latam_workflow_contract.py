"""Offline safety contract for the isolated LATAM GitHub Actions workflow."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    workflow = (ROOT / ".github/workflows/scrapers-latam.yml").read_text(encoding="utf-8")
    assert "workflow_dispatch:" in workflow
    assert "schedule:" in workflow, "a certified source needs an autonomous continuation path"
    assert "cron: '23 */6 * * *'" in workflow, "LATAM schedule must be explicit UTC and independent from matching/Universe minutes"
    assert "cron: '41 10 * * *'" in workflow, "PSF must have a provider-specific daily UTC schedule"
    assert "CVITAE_LATAM_SCRAPERS_ENABLED == 'true'" in workflow
    assert "CVITAE_LATAM_PARAGUAYCONCURSA_CERTIFIED == 'true'" in workflow
    assert "CVITAE_PROD_RELEASE_VALIDATED" not in workflow
    assert "concurrency:" in workflow and "cancel-in-progress: false" in workflow
    assert "--max-items-cap 20" in workflow and "CVITAE_LATAM_MAX_PAGES: '3'" in workflow
    assert "CVITAE_LATAM_MAX_DETAILS: '20'" in workflow
    assert "continue-on-error: true" in workflow
    assert "run_scraper_monitored.py paraguayconcursa_mef_scraper" in workflow
    assert "vars.CVITAE_LATAM_PSF_HIRINGROOM_CERTIFIED == 'true'" in workflow
    assert "vars.CVITAE_PSF_HIRINGROOM_FEED_AUTHORIZED == 'true'" in workflow
    assert "github.event.schedule == '41 10 * * *'" in workflow
    assert "run_scraper_monitored.py psf_hiringroom_scraper" in workflow
    assert "continue-on-error: true" not in workflow.split("psf-hiringroom:", 1)[1], "PSF failures must remain visible to the workflow result"
    assert "cleanup" not in workflow.casefold() and "netlify deploy" not in workflow.casefold()
    runner = (ROOT / "scripts/run_scraper_monitored.py").read_text(encoding="utf-8")
    assert 'if not control.get("collection_enabled", False)' in runner
    assert 'collection_enabled": False' in runner, "missing controls must be created fail-closed"
    summary = (ROOT / "scripts/summarize_scraper_run.py").read_text(encoding="utf-8")
    assert '"executed_unmeasured"' in summary and 'counts.get(status, 0)' in summary
    assert "--require-progress" in workflow and "cursor_advanced" in summary
    registry = __import__("json").loads((ROOT / "scrapers/source_registry.json").read_text(encoding="utf-8"))
    psf = next(row for row in registry["sources"] if row["source_id"] == "psf_hiringroom")
    assert psf["collection_enabled"] is False and psf["require_review"] is True
    assert all(psf[field] is False for field in ("catalog_enabled", "matching_enabled", "alerts_enabled", "seo_enabled"))
    legacy_workflow = (ROOT / ".github/workflows/scrapers.yml").read_text(encoding="utf-8")
    assert "vars.CVITAE_GRUPO_VIERCI_FEED_AUTHORIZED == 'true'" in legacy_workflow
    assert "run_scraper_monitored.py grupovierci_scraper" in legacy_workflow
    print("verify_latam_workflow_contract: PASS scheduled continuation; independent release/certification/source-control gates; manual dispatch; no cleanup or Netlify build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

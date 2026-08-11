"""Run every opportunity collector in an isolated, non-persistent audit mode."""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRAPERS = ROOT / "scrapers"
OUTPUT = ROOT / "tmp" / "scraper-audit"
EXCLUDED = {"get_linkedin_token.py", "insert_blog_post.py", "linkedin_poster.py", "opportunity_sink.py"}
PARAGUAY_SCRAPERS = {
    "abc_scrapper", "agroindustria_scraper", "automotriz_scraper", "bancos_scraper",
    "bolsas_locales_scraper", "buscojobs_scraper", "callcenters_scraper", "cde_frontera_scraper",
    "computrabajo_scraper", "constructoras_scraper", "cooperativas_scraper", "energia_utilities_scraper",
    "farmacias_scraper", "foros_scraper", "frigorificos_scraper", "fundacion_scraper",
    "gastronomia_hoteles_scraper", "googlejobs_v2", "googlejobs_v3", "grupocarteshs_scraper",
    "grupovierci_scraper", "hospitales_scraper", "industria_manufactura_scraper", "jooble_scraper",
    "logistica_transporte_scraper", "medios_comunicacion_scraper", "ministerios_scraper", "ongs_scraper",
    "puertos_importadoras_scraper", "retail_malls_scraper", "scrapper", "seguros_scraper",
    "sicca_scraper", "supermercados_scraper", "talentcom_scraper", "tech_local_scraper",
    "telecomunicaciones_scraper", "universidades_scraper", "unjobs_scraper", "workday_multinacionales_scraper",
}


def scripts() -> list[Path]:
    return sorted(path for path in SCRAPERS.glob("*.py") if path.name not in EXCLUDED and not path.name.startswith("__"))


def run_one(path: Path, timeout: int, max_items: int) -> dict:
    started = time.monotonic()
    artifact = OUTPUT / f"{path.stem}.json"
    env = os.environ.copy()
    env.update({
        "CVITAE_AUDIT_MODE": "1",
        "CVITAE_AUDIT_OUTPUT": str(artifact),
        "CVITAE_BATCH_LEGACY_WRITES": "1",
        "CVITAE_REQUIRE_REVIEW": "1",
        "CVITAE_MAX_ITEMS": str(max_items),
        "CVITAE_ALLOWED_COUNTRIES": "PY" if path.stem in PARAGUAY_SCRAPERS else "",
        "PYTHONIOENCODING": "utf-8",
        # Legacy collectors often require these merely to construct intercepted URLs.
        "SUPABASE_URL": env.get("SUPABASE_URL", "https://audit.invalid"),
        "SUPABASE_SERVICE_ROLE_KEY": env.get("SUPABASE_SERVICE_ROLE_KEY", "audit-only"),
        "PYTHONPATH": os.pathsep.join(filter(None, [str(SCRAPERS / "runtime_policy"), str(SCRAPERS), env.get("PYTHONPATH", "")])),
    })
    try:
        result = subprocess.run([sys.executable, str(path)], cwd=ROOT, env=env, capture_output=True, text=True, errors="replace", timeout=timeout)
        status = "completed" if result.returncode == 0 else "failed"
        error = None if result.returncode == 0 else (result.stderr or result.stdout)[-1200:]
    except subprocess.TimeoutExpired as exc:
        result = None
        status = "timeout"
        error = ((exc.stderr or "") + "\n" + (exc.stdout or ""))[-1200:]
    payload = {}
    if artifact.exists():
        try:
            payload = json.loads(artifact.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = {}
    summary = payload.get("summary") or {}
    sample = payload.get("sample") or []
    return {
        "scraper": path.stem,
        "status": status,
        "duration_seconds": round(time.monotonic() - started, 1),
        "return_code": result.returncode if result else None,
        "found": summary.get("found", 0),
        "valid": summary.get("valid", 0),
        "unique": summary.get("unique", 0),
        "rejected": summary.get("rejected", 0),
        "sample_count": len(sample),
        "sample": sample,
        "error": error,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--max-items", type=int, default=40)
    parser.add_argument("--only", nargs="*", default=[])
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    selected = scripts()
    if args.only:
        wanted = set(args.only)
        selected = [path for path in selected if path.stem in wanted or path.name in wanted]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as pool:
        futures = {pool.submit(run_one, path, args.timeout, max(1, min(args.max_items, 1000))): path for path in selected}
        results = []
        for future in concurrent.futures.as_completed(futures):
            item = future.result()
            results.append(item)
            print(f"[{len(results):02d}/{len(selected):02d}] {item['scraper']}: {item['status']} · {item['unique']} únicas · {item['duration_seconds']}s", flush=True)
    results.sort(key=lambda item: item["scraper"])
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "audit_mode": True, "results": results}
    (OUTPUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "total": len(results),
        "productive": sum(item["unique"] > 0 for item in results),
        "empty": sum(item["status"] == "completed" and item["unique"] == 0 for item in results),
        "failed": sum(item["status"] == "failed" for item in results),
        "timeout": sum(item["status"] == "timeout" for item in results),
        "unique_total_before_cross_source_dedupe": sum(item["unique"] for item in results),
        "report": str(OUTPUT / "report.json"),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

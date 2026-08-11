"""Validate staged beta opportunity URLs without changing Supabase."""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "tmp" / "scraper-audit"
sys.path.insert(0, str(ROOT / "scripts"))
from analyze_scraper_audit import beta_eligible, opportunity_kind  # noqa: E402

CLOSED = re.compile(r"(position has been filled|job (?:is )?closed|vacancy closed|application period (?:has )?ended|convocatoria cerrada|ya no est[aá] disponible|404 not found)", re.I)
BAD_PATH = re.compile(r"/(login|signin|privacy|terms)/?$", re.I)
HEADERS = {"User-Agent": "CVitaeQualityAudit/1.0 (+https://cvitae.lat)"}


def validate(item: dict, timeout: int) -> dict:
    url = str(item.get("application_url") or "").strip()
    started = time.monotonic()
    try:
        response = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True, stream=True)
        sample = b""
        for chunk in response.iter_content(8192):
            sample += chunk
            if len(sample) >= 120_000: break
        text = sample.decode(response.encoding or "utf-8", errors="ignore")
        final_url = response.url
        parsed = urlparse(final_url)
        bad_destination = not parsed.netloc or bool(BAD_PATH.search(parsed.path))
        closed = bool(CLOSED.search(text))
        if 200 <= response.status_code < 400 and not bad_destination and not closed:
            decision, reason = "candidate", "URL accesible y sin señales de cierre"
        elif response.status_code in (401, 403, 429):
            decision, reason = "manual_review", f"Fuente bloquea validación automática ({response.status_code})"
        else:
            decision, reason = "quarantine", f"HTTP {response.status_code}" if not closed else "La página indica cierre"
        return {"url": url, "final_url": final_url, "status_code": response.status_code, "decision": decision, "reason": reason, "duration_ms": round((time.monotonic()-started)*1000)}
    except requests.RequestException as exc:
        return {"url": url, "final_url": None, "status_code": None, "decision": "manual_review", "reason": f"{type(exc).__name__}: validación inconclusa", "duration_ms": round((time.monotonic()-started)*1000)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=12)
    args = parser.parse_args()
    report = json.loads((AUDIT / "report.json").read_text(encoding="utf-8"))
    items, seen = [], set()
    for result in report["results"]:
        for item in result.get("sample") or []:
            url = str(item.get("application_url") or "")
            if url and url not in seen and beta_eligible(item):
                seen.add(url); items.append(item)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 12))) as pool:
        checks = list(pool.map(lambda item: validate(item, args.timeout), items))
    by_url = {check["url"]: check for check in checks}
    rows = [{"title": item.get("title"), "source": item.get("source"), "kind": opportunity_kind(item), **by_url[str(item.get("application_url"))]} for item in items]
    output = {"checked": len(rows), "decisions": dict(Counter(row["decision"] for row in rows)), "by_source": {}, "results": rows}
    for source in sorted({row["source"] for row in rows}):
        output["by_source"][source] = dict(Counter(row["decision"] for row in rows if row["source"] == source))
    (AUDIT / "approval-report.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in output.items() if key != "results"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

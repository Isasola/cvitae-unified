"""Run one scraper and persist private execution telemetry in Supabase."""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

import requests

ERROR_RE = re.compile(
    r"(traceback|exception|fetch error|connectionerror|timeout|name resolution|"
    r"certificate_verify_failed|status(?:\s*code)?\s*[:=]?\s*[45]\d\d|->\s*[45]\d\d)",
    re.IGNORECASE,
)
WARNING_RE = re.compile(r"(warning|advertencia|deprecated)", re.IGNORECASE)
FOUND_RE = re.compile(r"(?:encontrad[ao]s?|totales?)\D{0,12}(\d+)", re.IGNORECASE)
INSERTED_RE = re.compile(r"(?:insertad[ao]s?|nuev[ao]s?|guardad[ao]s?)\D{0,12}(\d+)", re.IGNORECASE)


def api_headers() -> dict[str, str]:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def save(payload: dict, record_id: str | None = None) -> str:
    base = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/scraper_runs"
    if record_id:
        response = requests.patch(
            f"{base}?id=eq.{record_id}", headers=api_headers(), json=payload, timeout=20
        )
    else:
        response = requests.post(base, headers=api_headers(), json=payload, timeout=20)
    response.raise_for_status()
    data = response.json()
    return record_id or data[0]["id"]


def last_number(pattern: re.Pattern, text: str) -> int | None:
    matches = pattern.findall(text)
    return int(matches[-1]) if matches else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("scraper_id")
    parser.add_argument("scraper_name")
    parser.add_argument("script_path")
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()

    run_id = os.getenv("GITHUB_RUN_ID", f"local-{int(time.time())}")
    trigger = os.getenv("GITHUB_EVENT_NAME", "local")
    trigger_type = "schedule" if trigger == "schedule" else "manual" if trigger == "workflow_dispatch" else "local"
    server = os.getenv("GITHUB_SERVER_URL", "https://github.com")
    repo = os.getenv("GITHUB_REPOSITORY", "")
    github_url = f"{server}/{repo}/actions/runs/{run_id}" if repo else None
    started = datetime.now(timezone.utc)

    record_id = None
    try:
        record_id = save({
            "run_id": run_id,
            "scraper_id": args.scraper_id,
            "scraper_name": args.scraper_name,
            "script_path": args.script_path,
            "trigger_type": trigger_type,
            "status": "running",
            "github_run_url": github_url,
            "started_at": started.isoformat(),
        })
    except Exception as exc:
        # Monitoring must never prevent opportunity ingestion.
        print(f"[monitor] No se pudo iniciar telemetría: {type(exc).__name__}", file=sys.stderr)

    try:
        result = subprocess.run(
            [sys.executable, args.script_path],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=args.timeout,
            env=os.environ.copy(),
        )
        output = (result.stdout + "\n" + result.stderr).strip()
        error_lines = [line.strip() for line in output.splitlines() if ERROR_RE.search(line)]
        warning_count = len(WARNING_RE.findall(output))
        error_count = len(error_lines)
        if result.returncode != 0:
            status = "failed"
            if not error_lines:
                useful_lines = [line.strip() for line in output.splitlines() if line.strip()]
                error_lines = [useful_lines[-1] if useful_lines else f"Proceso finalizó con código {result.returncode}"]
                error_count = 1
        elif error_count:
            status = "warning"
        else:
            status = "healthy"
        exit_code = result.returncode
    except subprocess.TimeoutExpired as exc:
        output = ((exc.stdout or "") + "\n" + (exc.stderr or "")).strip()
        error_lines = [f"Tiempo máximo excedido ({args.timeout}s)"]
        warning_count, error_count, exit_code, status = 0, 1, None, "timeout"

    finished = datetime.now(timezone.utc)
    duration = max(0, round((finished - started).total_seconds()))
    excerpt = output[-12000:] if output else "El scraper no produjo salida."
    if record_id:
        try:
            save({
                "status": status,
                "exit_code": exit_code,
                "found_count": last_number(FOUND_RE, output),
                "inserted_count": last_number(INSERTED_RE, output),
                "warning_count": warning_count,
                "error_count": error_count,
                "error_summary": "\n".join(error_lines[:8])[:2000] or None,
                "log_excerpt": excerpt,
                "finished_at": finished.isoformat(),
                "duration_seconds": duration,
                "updated_at": finished.isoformat(),
            }, record_id)
        except Exception as exc:
            print(f"[monitor] No se pudo finalizar telemetría: {type(exc).__name__}", file=sys.stderr)

    print(output)
    print(f"\n[monitor] {args.scraper_id}: {status} · {duration}s · {error_count} error(es)")
    return 0  # Other scrapers must continue; status is persisted independently.


if __name__ == "__main__":
    raise SystemExit(main())

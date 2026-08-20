"""Run one scraper and persist private execution telemetry in Supabase."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

ERROR_RE = re.compile(
    r"(traceback|exception|fetch error|connectionerror|timeout|name resolution|"
    r"certificate_verify_failed|status(?:\s*code)?\s*[:=]?\s*[45]\d\d|->\s*[45]\d\d)",
    re.IGNORECASE,
)
WARNING_RE = re.compile(r"(warning|advertencia|deprecated)", re.IGNORECASE)
FOUND_RE = re.compile(r"(?:encontrad[ao]s?|totales?)\D{0,12}(\d+)", re.IGNORECASE)
INSERTED_RE = re.compile(r"(?:insertad[ao]s?|nuev[ao]s?|guardad[ao]s?)\D{0,12}(\d+)", re.IGNORECASE)
SUMMARY_RE = re.compile(r"^CVITAE_INGESTION_SUMMARY=(\{.*\})$", re.MULTILINE)
BLOCKED_RE = re.compile(r"(block|captcha|login|autentic|forbidden|403)", re.IGNORECASE)


def write_local_status(scraper_id: str, status: str, **details: object) -> None:
    """Persist workflow-local operational metadata for the final summary."""
    root = Path(os.getenv("RUNNER_TEMP") or (Path.cwd() / ".cvitae-run-status"))
    root.mkdir(parents=True, exist_ok=True)
    safe_id = re.sub(r"[^a-z0-9_-]+", "_", scraper_id.casefold())
    payload = {
        "scraper_id": scraper_id,
        "status": status,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        **details,
    }
    (root / f"cvitae-{safe_id}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def db_status(status: str) -> str:
    """Map explicit states onto the existing scraper_runs DB constraint."""
    return {
        "success": "healthy",
        "partial_success": "warning",
        "skipped": "warning",
        "blocked": "warning",
        "failed": "failed",
    }.get(status, "failed")


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


def load_control(scraper_id: str, scraper_name: str, script_path: str) -> dict:
    base = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/scraper_controls"
    response = requests.get(
        f"{base}?scraper_id=eq.{quote(scraper_id)}&select=*",
        headers=api_headers(),
        timeout=20,
    )
    response.raise_for_status()
    rows = response.json()
    if rows:
        return rows[0]
    payload = {
        "scraper_id": scraper_id,
        "scraper_name": scraper_name,
        "script_path": script_path,
        "collection_enabled": False,
        "paused_reason": "Detectado automáticamente; requiere configuración inicial.",
        "updated_by": "runner",
    }
    created = requests.post(base, headers=api_headers(), json=payload, timeout=20)
    created.raise_for_status()
    return created.json()[0]


def maybe_auto_pause(control: dict, scraper_id: str, current_status: str) -> None:
    if not control.get("auto_pause_on_failure") or current_status != "failed":
        return
    threshold = max(1, int(control.get("consecutive_failures_before_pause") or 3))
    base = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
    response = requests.get(
        f"{base}/scraper_runs?select=status&scraper_id=eq.{quote(scraper_id)}&order=started_at.desc&limit={threshold}",
        headers=api_headers(), timeout=20,
    )
    response.raise_for_status()
    statuses = [row.get("status") for row in response.json()]
    if len(statuses) < threshold or any(value not in {"failed", "timeout"} for value in statuses):
        return
    reason = f"Pausa automática: {threshold} fallas consecutivas. Revisar logs antes de reactivar."
    update = requests.patch(
        f"{base}/scraper_controls?scraper_id=eq.{quote(scraper_id)}",
        headers=api_headers(),
        json={"collection_enabled": False, "paused_reason": reason, "updated_by": "runner", "updated_at": datetime.now(timezone.utc).isoformat()},
        timeout=20,
    )
    update.raise_for_status()
    print(f"[monitor] {reason}")


def update_control_quality(scraper_id: str, status: str, summary: dict | None, error_lines: list[str], finished_at: str) -> None:
    found = summary.get("found") if summary else None
    inserted = summary.get("inserted") if summary else None
    quality = (
        "broken" if status in {"failed", "telemetry_failed"}
        else "healthy" if isinstance(inserted, int) and inserted > 0
        else "degraded" if status == "partial_success"
        else "unproductive" if found == 0
        else "degraded"
    )
    base = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/scraper_controls"
    response = requests.patch(
        f"{base}?scraper_id=eq.{quote(scraper_id)}",
        headers=api_headers(),
        json={
            "quality_status": quality,
            "last_run_status": status,
            "last_run_at": finished_at,
            "last_found_count": found,
            "last_inserted_count": inserted,
            "last_error_summary": "\n".join(error_lines[:8])[:2000] or None,
            "last_audited_at": finished_at,
            "updated_at": finished_at,
            "updated_by": "runner",
        }, timeout=20,
    )
    response.raise_for_status()


def last_number(pattern: re.Pattern, text: str) -> int | None:
    matches = pattern.findall(text)
    return int(matches[-1]) if matches else None


def structured_summary(text: str) -> dict | None:
    match = SUMMARY_RE.search(text)
    if not match:
        return None
    try:
        value = json.loads(match.group(1))
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        return None


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

    try:
        control = load_control(args.scraper_id, args.scraper_name, args.script_path)
    except Exception as exc:
        print(f"[monitor] No se pudo leer la política del scraper: {type(exc).__name__}", file=sys.stderr)
        write_local_status(args.scraper_id, "telemetry_failed", reason="control_unavailable")
        return 1

    effective_timeout = min(args.timeout, max(30, int(control.get("max_runtime_seconds") or args.timeout)))
    if not control.get("collection_enabled", False):
        finished = datetime.now(timezone.utc)
        reason = control.get("paused_reason") or "Pausado desde el centro de control"
        explicit_status = "blocked" if BLOCKED_RE.search(reason) else "skipped"
        try:
            save({
                "run_id": run_id,
                "scraper_id": args.scraper_id,
                "scraper_name": args.scraper_name,
                "script_path": args.script_path,
                "trigger_type": trigger_type,
                "status": db_status(explicit_status),
                "warning_count": 1,
                "error_count": 0,
                "error_summary": f"[{explicit_status.upper()}] {reason}",
                "started_at": started.isoformat(),
                "finished_at": finished.isoformat(),
                "duration_seconds": 0,
                "github_run_url": github_url,
            })
        except Exception as exc:
            print(f"[monitor] No se pudo registrar la pausa: {type(exc).__name__}", file=sys.stderr)
            write_local_status(args.scraper_id, "telemetry_failed", reason="skipped_run_not_persisted")
            return 1
        write_local_status(args.scraper_id, explicit_status, reason=reason)
        print(f"[monitor] {args.scraper_id}: pausado · {reason}")
        return 0

    record_id = None
    telemetry_ok = True
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
        telemetry_ok = False

    summary = None
    try:
        child_env = os.environ.copy()
        child_env["CVITAE_MAX_ITEMS"] = str(control.get("max_items_per_run") or 250)
        child_env["CVITAE_ALLOWED_COUNTRIES"] = ",".join(control.get("allowed_country_codes") or [])
        child_env["CVITAE_REQUIRE_REVIEW"] = "1" if control.get("require_review", True) else "0"
        runtime_policy = os.path.abspath(os.path.join("scrapers", "runtime_policy"))
        scraper_modules = os.path.abspath("scrapers")
        existing_pythonpath = child_env.get("PYTHONPATH", "")
        child_env["PYTHONPATH"] = os.pathsep.join(filter(None, [runtime_policy, scraper_modules, existing_pythonpath]))
        child_env["CVITAE_BATCH_LEGACY_WRITES"] = "1"
        result = subprocess.run(
            [sys.executable, args.script_path],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=effective_timeout,
            env=child_env,
        )
        output = (result.stdout + "\n" + result.stderr).strip()
        summary = structured_summary(output)
        error_lines = [line.strip() for line in output.splitlines() if ERROR_RE.search(line)]
        if summary:
            error_lines = [str(item) for item in summary.get("errors", []) if item]
        warning_count = len(WARNING_RE.findall(output))
        error_count = int(summary.get("rejected", 0)) if summary else len(error_lines)
        if result.returncode != 0:
            status = "failed"
            if not error_lines:
                useful_lines = [line.strip() for line in output.splitlines() if line.strip()]
                error_lines = [useful_lines[-1] if useful_lines else f"Proceso finalizó con código {result.returncode}"]
                error_count = 1
        elif error_count or warning_count:
            status = "partial_success"
        else:
            status = "success"
        exit_code = result.returncode
    except subprocess.TimeoutExpired as exc:
        output = ((exc.stdout or "") + "\n" + (exc.stderr or "")).strip()
        error_lines = [f"Tiempo máximo excedido ({effective_timeout}s)"]
        warning_count, error_count, exit_code, status = 0, 1, None, "failed"

    finished = datetime.now(timezone.utc)
    duration = max(0, round((finished - started).total_seconds()))
    excerpt = output[-12000:] if output else "El scraper no produjo salida."
    if record_id:
        try:
            save({
                "status": db_status(status),
                "exit_code": exit_code,
                "found_count": summary.get("found") if summary else last_number(FOUND_RE, output),
                "inserted_count": summary.get("inserted") if summary else last_number(INSERTED_RE, output),
                "valid_count": summary.get("valid") if summary else None,
                "unique_count": summary.get("unique") if summary else None,
                "updated_count": summary.get("updated") if summary else None,
                "duplicate_count": summary.get("duplicates_in_run") if summary else None,
                "rejected_count": summary.get("rejected") if summary else None,
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
            telemetry_ok = False

    try:
        maybe_auto_pause(control, args.scraper_id, status)
    except Exception as exc:
        print(f"[monitor] No se pudo evaluar autopausa: {type(exc).__name__}", file=sys.stderr)
    try:
        update_control_quality(args.scraper_id, status, summary, error_lines, finished.isoformat())
    except Exception as exc:
        print(f"[monitor] No se pudo actualizar calidad del scraper: {type(exc).__name__}", file=sys.stderr)

    final_status = status if telemetry_ok else "telemetry_failed"
    write_local_status(
        args.scraper_id,
        final_status,
        scraper_status=status,
        exit_code=exit_code,
        error_count=error_count,
        duration_seconds=duration,
    )
    print(output)
    print(f"\n[monitor] {args.scraper_id}: {final_status} · {duration}s · {error_count} error(es)")
    # Individual workflow steps may continue, but the final summary must fail
    # for a real scraper or telemetry failure.
    return 1 if final_status in {"failed", "telemetry_failed"} else 0


if __name__ == "__main__":
    raise SystemExit(main())

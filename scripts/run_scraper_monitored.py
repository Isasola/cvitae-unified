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
ADAPTER_METRICS_RE = re.compile(r"^CVITAE_ADAPTER_METRICS=(\{.*\})$", re.MULTILINE)
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
        "success_zero_confirmed": "warning",
        "empty_eof_confirmed": "warning",
        "resumable": "warning",
        "stalled": "warning",
        "executed_unmeasured": "warning",
        "partial_success": "warning",
        "skipped": "warning",
        "blocked": "warning",
        "failed": "failed",
    }.get(status, "failed")


def _count(*values: object) -> int | None:
    for value in values:
        if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
            return value
    return None


def execution_metrics(summary: dict | None, adapter_metrics: dict | None, output: str = "") -> dict:
    """Preserve stage counts without treating missing telemetry as a zero."""
    extraction = (adapter_metrics or {}).get("extraction_metrics")
    extraction = extraction if isinstance(extraction, dict) else {}
    found = _count(extraction.get("discovered"), extraction.get("found"), (summary or {}).get("found"), last_number(FOUND_RE, output))
    inserted = _count((summary or {}).get("inserted"), extraction.get("inserted"), last_number(INSERTED_RE, output))
    budget_skipped = _count((summary or {}).get("budget_skipped"), extraction.get("budget_skipped"))
    cursor = extraction.get("latam_cursor") or extraction.get("cursor") or {}
    continuation = extraction.get("continuation_pending")
    if not isinstance(continuation, bool) and isinstance(cursor, dict):
        continuation = cursor.get("continuation_pending")
    if not isinstance(continuation, bool):
        continuation = None
    cursor_progress = extraction.get("cursor_progress")
    cursor_advanced = cursor_progress.get("advanced") if isinstance(cursor_progress, dict) and isinstance(cursor_progress.get("advanced"), bool) else None
    eof_confirmed = extraction.get("eof_confirmed") is True or extraction.get("pagination_eof") is True
    http_status = _count(extraction.get("http_status"), extraction.get("last_http_status"))
    transport_error = bool(extraction.get("transport_error") or extraction.get("technical_failure") is True or extraction.get("blocked") is True)
    cursor_circular = bool(isinstance(cursor_progress, dict) and (cursor_progress.get("circular") is True or cursor_progress.get("loop_detected") is True))
    unique = _count((summary or {}).get("unique"), extraction.get("unique"))
    rejection_reasons = (summary or {}).get("rejection_reasons")
    if not isinstance(rejection_reasons, dict):
        rejection_reasons = extraction.get("rejected_by_gate_reasons") if isinstance(extraction.get("rejected_by_gate_reasons"), dict) else None
    submitted = _count(
        (summary or {}).get("submitted"), extraction.get("submitted"),
        unique - budget_skipped if unique is not None and budget_skipped is not None else None,
    )
    return {
        "discovered": found,
        "detail_attempted": _count(extraction.get("detail_attempted"), extraction.get("details_fetched"), (summary or {}).get("detail_attempted")),
        "normalized": _count((summary or {}).get("valid"), extraction.get("normalized")),
        "unique": unique,
        "submitted": submitted,
        "inserted": inserted,
        "updated": _count((summary or {}).get("updated"), extraction.get("updated")),
        "unchanged": _count((summary or {}).get("unchanged"), extraction.get("unchanged")),
        "duplicate": _count((summary or {}).get("duplicates_in_run"), extraction.get("duplicates")),
        "rejected_by_gate": _count((summary or {}).get("rejected"), extraction.get("rejected")),
        "rejected_by_gate_reasons": rejection_reasons,
        "failed": _count((summary or {}).get("failed"), extraction.get("failed")),
        "budget_skipped": budget_skipped,
        "continuation_pending": continuation,
        "cursor_advanced": cursor_advanced,
        "eof_confirmed": eof_confirmed,
        "http_status": http_status,
        "transport_error": transport_error,
        "cursor_circular": cursor_circular,
    }


def measured_execution_status(status: str, metrics: dict) -> str:
    """Require explicit EOF or durable continuation evidence before healthy outcomes."""
    if status in {"failed", "skipped", "blocked"}:
        return status
    if metrics.get("transport_error") or metrics.get("http_status") not in (None, 200):
        return "failed"
    if metrics.get("cursor_circular"):
        return "stalled"
    if metrics["discovered"] is None or metrics["inserted"] is None:
        return "executed_unmeasured"
    if metrics["continuation_pending"] is True:
        budget_skipped = metrics.get("budget_skipped")
        if isinstance(budget_skipped, int) and budget_skipped > 0 and metrics.get("cursor_advanced") is True:
            return "resumable"
        return "stalled"
    if metrics["discovered"] == 0 and metrics["inserted"] == 0:
        complete = all(metrics.get(key) is not None for key in (
            "detail_attempted", "normalized", "unique", "submitted", "updated", "unchanged",
            "duplicate", "rejected_by_gate", "failed", "budget_skipped",
        ))
        if complete and metrics.get("eof_confirmed") is True and metrics.get("http_status") == 200 and metrics.get("failed") == 0 and metrics.get("budget_skipped") == 0:
            return "empty_eof_confirmed"
        return "stalled" if complete else "executed_unmeasured"
    return "partial_success" if status == "partial_success" else "success"


def configured_item_budget(control: dict, trigger_type: str, cap: int | None = None) -> int:
    """Resolve the existing control budget; an optional workflow cap can only lower it."""
    if trigger_type == "scan":
        configured = control.get("scan_max_items") or 50
    elif trigger_type == "schedule":
        configured = control.get("schedule_max_items") or 10000
    else:
        configured = control.get("max_items_per_run") or 250
    value = max(1, int(configured))
    return min(value, max(1, int(cap))) if cap is not None else value


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


def update_control_quality(scraper_id: str, status: str, summary: dict | None, error_lines: list[str], finished_at: str, adapter_metrics: dict | None = None) -> None:
    found = summary.get("found") if summary else None
    inserted = summary.get("inserted") if summary else None
    quality = (
        "broken" if status in {"failed", "telemetry_failed", "stalled"}
        else "degraded" if status in {"executed_unmeasured", "resumable", "partial_success"}
        else "unproductive" if status == "success_zero_confirmed"
        else "healthy" if status == "empty_eof_confirmed"
        else "healthy" if isinstance(inserted, int) and inserted > 0
        else "unproductive" if found == 0
        else "degraded"
    )
    adapter_health = ((adapter_metrics or {}).get("extraction_metrics") or {}).get("health", {}).get("status")
    if adapter_health == "DEGRADED":
        quality = "degraded"
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

def structured_adapter_metrics(text: str) -> dict | None:
    match = ADAPTER_METRICS_RE.search(text)
    if not match: return None
    try:
        value = json.loads(match.group(1))
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError: return None


def execution_outcome(returncode: int, output: str, summary: dict | None) -> tuple[list[str], int, int, str]:
    """Classify technical execution separately from valid business rejection."""
    error_lines = [line.strip() for line in output.splitlines() if ERROR_RE.search(line)]
    if summary:
        if isinstance(summary.get("technical_errors"), list):
            error_lines = [str(item) for item in summary.get("technical_errors", []) if item]
        elif summary.get("technical_failure") is False:
            # Explicit separation is authoritative: normalization/business
            # rejections and processing-budget skips are outcomes, not runtime
            # failures. Technical evidence below can still fail the run.
            error_lines = []
        else:
            error_lines = [str(item) for item in summary.get("errors", []) if item]
        adapter_metrics = structured_adapter_metrics(output) or {}
        extraction = adapter_metrics.get("extraction_metrics") or {}
        lineage = extraction.get("scan_lineage") or {}
        lineage_evidence = lineage.get("lineage_evidence") or {}
        technical_reasons = []
        if summary.get("technical_failure") is True:
            technical_reasons.append("INGESTION_TECHNICAL_FAILURE")
        if int(summary.get("lineage_failed") or 0) > 0:
            technical_reasons.append("INGESTION_LINEAGE_WRITE_FAILED")
        if int(summary.get("source_identity_failed") or 0) > 0:
            technical_reasons.append("PRODUCER_IDENTITY_CORRUPTED")
        if lineage_evidence.get("status") == "WARNING":
            technical_reasons.extend(str(reason) for reason in lineage_evidence.get("reason_codes", []) if reason)
        counts = lineage.get("counts") or {}
        if int(counts.get("PERSISTED", 0)) > 0 and lineage_evidence.get("status") != "PASS":
            technical_reasons.append("PERSISTED_ROW_WITHOUT_CONFIRMED_LINEAGE")
        for reason in dict.fromkeys(technical_reasons):
            if reason not in error_lines:
                error_lines.append(reason)
    warning_count = len(WARNING_RE.findall(output))
    error_count = len(error_lines)
    if returncode != 0:
        status = "failed"
        if not error_lines:
            useful_lines = [line.strip() for line in output.splitlines() if line.strip()]
            error_lines = [useful_lines[-1] if useful_lines else f"Proceso finalizó con código {returncode}"]
            error_count = 1
    elif error_count:
        status = "failed"
    elif warning_count:
        status = "partial_success"
    else:
        status = "success"
    health_status = (((structured_adapter_metrics(output) or {}).get("extraction_metrics") or {}).get("health") or {}).get("status")
    if status == "success" and health_status == "DEGRADED":
        status = "partial_success"
        warning_count += 1
    elif status == "success" and health_status in {"ERROR", "FAILED"}:
        status = "failed"
        error_count += 1
    return error_lines, warning_count, error_count, status


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("scraper_id")
    parser.add_argument("scraper_name")
    parser.add_argument("script_path")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--max-items-cap", type=int, help="Optional source-workflow budget cap; never raises the scraper control budget")
    args = parser.parse_args()

    run_id = os.getenv("GITHUB_RUN_ID", f"local-{int(time.time())}")
    trigger = os.getenv("GITHUB_EVENT_NAME", "local")
    scan_request_id = os.getenv("CVITAE_SOURCE_SCAN_REQUEST_ID", "").strip()
    trigger_type = "scan" if scan_request_id else "schedule" if trigger == "schedule" else "manual" if trigger == "workflow_dispatch" else "local"
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
                "scan_request_id": scan_request_id or None,
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
            "scan_request_id": scan_request_id or None,
            "status": "running",
            "github_run_url": github_url,
            "started_at": started.isoformat(),
        })
    except Exception as exc:
        # Monitoring must never prevent opportunity ingestion.
        print(f"[monitor] No se pudo iniciar telemetría: {type(exc).__name__}", file=sys.stderr)
        telemetry_ok = False

    summary = None
    adapter_metrics = None
    counters = {}
    try:
        child_env = os.environ.copy()
        # Propagate the durable monitored-run identity into adapter evidence.
        # The child never derives lineage from wall-clock timestamps.
        child_env["CVITAE_SCRAPER_RUN_ID"] = run_id
        child_env["CVITAE_SCRAPER_ID"] = args.scraper_id
        child_env.setdefault("CVITAE_ADAPTER_VERSION", os.getenv("CVITAE_ADAPTER_VERSION", ""))
        child_env.pop("CVITAE_SCRAPER_RUN_DB_ID", None)
        if record_id:
            child_env["CVITAE_SCRAPER_RUN_DB_ID"] = record_id
        child_env["CVITAE_SOURCE_SCAN_REQUEST_ID"] = scan_request_id
        # A source workflow may lower an existing control-plane budget only.
        child_env["CVITAE_MAX_ITEMS"] = str(configured_item_budget(control, trigger_type, args.max_items_cap))
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
        adapter_metrics = structured_adapter_metrics(output)
        error_lines, warning_count, error_count, status = execution_outcome(result.returncode, output, summary)
        counters = execution_metrics(summary, adapter_metrics, output)
        status = measured_execution_status(status, counters)
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
            final_payload = {
                "status": db_status(status),
                "exit_code": exit_code,
                "found_count": summary.get("found") if summary else (adapter_metrics or {}).get("extraction_metrics", {}).get("found", last_number(FOUND_RE, output)),
                "inserted_count": summary.get("inserted") if summary else last_number(INSERTED_RE, output),
                "valid_count": summary.get("valid") if summary else None,
                "unique_count": summary.get("unique") if summary else None,
                "updated_count": summary.get("updated") if summary else None,
                "duplicate_count": summary.get("duplicates_in_run") if summary else None,
                "rejected_count": summary.get("rejected") if summary else None,
                "unchanged_count": summary.get("unchanged") if summary else None,
                "warning_count": warning_count,
                "error_count": error_count,
                "error_summary": "\n".join(error_lines[:8])[:2000]
                    or ("BUSINESS_REJECTION_REASONS=" + json.dumps(counters.get("rejected_by_gate_reasons"), ensure_ascii=False)[:1200]
                        if counters.get("rejected_by_gate_reasons") else None)
                    or (f"[{status.upper()}]" if status != "success" else None),
                "log_excerpt": excerpt,
                "finished_at": finished.isoformat(),
                "duration_seconds": duration,
                "updated_at": finished.isoformat(),
                "adapter_version": adapter_metrics.get("adapter_version") if adapter_metrics else None,
            }
            # A timeout or killed child may already have checkpointed a durable
            # source cursor.  Omit this field when no final adapter report
            # exists instead of erasing that checkpoint with JSON null.
            if adapter_metrics and isinstance(adapter_metrics.get("extraction_metrics"), dict):
                extraction_metrics = dict(adapter_metrics["extraction_metrics"])
                extraction_metrics["run_accounting"] = {"state": status, **counters}
                final_payload["extraction_metrics"] = extraction_metrics
            save(final_payload, record_id)
        except Exception as exc:
            print(f"[monitor] No se pudo finalizar telemetría: {type(exc).__name__}", file=sys.stderr)
            telemetry_ok = False

    try:
        maybe_auto_pause(control, args.scraper_id, status)
    except Exception as exc:
        print(f"[monitor] No se pudo evaluar autopausa: {type(exc).__name__}", file=sys.stderr)
    try:
        update_control_quality(args.scraper_id, status, summary, error_lines, finished.isoformat(), adapter_metrics)
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
        **counters,
        measurement_state="MEASURED" if counters.get("discovered") is not None and counters.get("inserted") is not None else "UNMEASURED",
    )
    print(output)
    print(f"\n[monitor] {args.scraper_id}: {final_status} · {duration}s · {error_count} error(es)")
    # Individual workflow steps may continue, but the final summary must fail
    # for a real scraper or telemetry failure.
    return 1 if final_status in {"failed", "telemetry_failed"} else 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Runtime adapter that batches legacy opportunity POSTs through OpportunitySink.

Python imports sitecustomize automatically when this directory is on PYTHONPATH.
Only Supabase writes to /rest/v1/opportunities are intercepted; external source
requests keep their original behavior.
"""
from __future__ import annotations

import atexit
import json
import os
import threading
from typing import Any

import requests


_original_request = requests.sessions.Session.request
_buffer: list[dict[str, Any]] = []
_lock = threading.Lock()
_flushed = False


def _is_opportunity_write(method: str, url: object, kwargs: dict[str, Any]) -> bool:
    headers = kwargs.get("headers") or {}
    return (
        method.upper() == "POST"
        and "/rest/v1/opportunities" in str(url)
        and headers.get("X-CVitae-Sink") != "1"
    )


def _buffered_request(self, method: str, url: object, *args, **kwargs):
    if not _is_opportunity_write(method, url, kwargs):
        return _original_request(self, method, url, *args, **kwargs)
    payload = kwargs.get("json")
    rows = payload if isinstance(payload, list) else [payload]
    with _lock:
        _buffer.extend(row for row in rows if isinstance(row, dict))
    response = requests.Response()
    response.status_code = 202
    response.url = str(url)
    response._content = b""
    return response


def _flush() -> None:
    global _flushed
    with _lock:
        if _flushed or not _buffer:
            return
        _flushed = True
        rows = list(_buffer)
    try:
        from opportunity_sink import OpportunitySink
        summary = OpportunitySink().upsert(rows)
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    except Exception as exc:
        summary = {
            "found": len(rows), "valid": 0, "unique": 0, "inserted": 0,
            "updated": 0, "duplicates_in_run": 0, "rejected": len(rows),
            "errors": [f"Error al vaciar lote: {type(exc).__name__}: {str(exc)[:300]}"],
        }
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary, ensure_ascii=False))


if os.getenv("CVITAE_BATCH_LEGACY_WRITES", "1") == "1":
    requests.sessions.Session.request = _buffered_request
    atexit.register(_flush)

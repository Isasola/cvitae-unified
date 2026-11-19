"""Bounded HTTP and durable scraper_runs cursor helpers for LATAM sources."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
import os
from pathlib import Path
import time
from typing import Any, Callable
from urllib.parse import quote

import requests


class UpstreamFailure(RuntimeError):
    def __init__(self, kind: str, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.status_code = status_code


class RetryDeferred(UpstreamFailure):
    def __init__(self, retry_after_seconds: int):
        super().__init__("RETRY_DEFERRED", f"retry_after_exceeds_run_budget:{retry_after_seconds}", status_code=429)
        self.retry_after_seconds = retry_after_seconds


class UnexpectedMarkup(UpstreamFailure):
    def __init__(self, message: str):
        super().__init__("UNEXPECTED_MARKUP", message)


def _retry_after_seconds(value: str | None, now: datetime) -> int | None:
    if not value:
        return None
    try:
        return max(0, int(float(value.strip())))
    except (ValueError, TypeError):
        try:
            parsed = parsedate_to_datetime(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return max(0, int((parsed - now).total_seconds()))
        except (TypeError, ValueError, OverflowError):
            return None


def fetch_response(
    session: requests.Session,
    url: str,
    *,
    timeout: tuple[float, float] = (5, 20),
    attempts: int = 3,
    max_retry_after_seconds: int = 30,
    sleep: Callable[[float], None] = time.sleep,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> requests.Response:
    """Fetch one page; transport/status failures can never be interpreted as EOF."""
    attempts = max(1, min(int(attempts), 4))
    for attempt in range(attempts):
        try:
            response = session.get(url, timeout=timeout, headers={"User-Agent": "CVitaeSourceMonitor/1.0 (+https://cvitae.lat)"})
        except requests.Timeout as exc:
            if attempt + 1 == attempts:
                raise UpstreamFailure("TIMEOUT", "source_request_timeout") from exc
            sleep(min(2 ** attempt, 4))
            continue
        except requests.RequestException as exc:
            if attempt + 1 == attempts:
                raise UpstreamFailure("HTTP_ERROR", f"source_request_error:{type(exc).__name__}") from exc
            sleep(min(2 ** attempt, 4))
            continue

        if response.status_code == 429:
            delay = _retry_after_seconds(response.headers.get("Retry-After"), now())
            if delay is None:
                delay = min(2 ** attempt, 8)
            if attempt + 1 == attempts or delay > max_retry_after_seconds:
                raise RetryDeferred(delay)
            sleep(delay)
            continue
        if 500 <= response.status_code <= 599:
            if attempt + 1 == attempts:
                raise UpstreamFailure("HTTP_ERROR", f"source_http_{response.status_code}", status_code=response.status_code)
            sleep(min(2 ** attempt, 4))
            continue
        if response.status_code in (403, 401, 406, 451):
            raise UpstreamFailure("BLOCKED", f"source_blocked_http_{response.status_code}", status_code=response.status_code)
        if response.status_code == 404:
            raise UpstreamFailure("HTTP_404", "source_http_404", status_code=404)
        if response.status_code < 200 or response.status_code >= 300:
            raise UpstreamFailure("HTTP_ERROR", f"source_http_{response.status_code}", status_code=response.status_code)
        if not response.content:
            raise UnexpectedMarkup("empty_http_200_response")
        return response
    raise UpstreamFailure("HTTP_ERROR", "source_request_attempts_exhausted")


@dataclass
class Cursor:
    page: int = 1
    card_offset: int = 0
    continuation_pending: bool = False
    last_native_id: str | None = None

    @classmethod
    def from_payload(cls, value: Any) -> "Cursor":
        if not isinstance(value, dict):
            return cls()
        try:
            page = max(1, int(value.get("page", 1)))
            card_offset = max(0, int(value.get("card_offset", 0)))
        except (TypeError, ValueError):
            return cls()
        return cls(page, card_offset, bool(value.get("continuation_pending")), value.get("last_native_id"))

    def payload(self) -> dict[str, Any]:
        return {
            "page": self.page,
            "card_offset": self.card_offset,
            "continuation_pending": self.continuation_pending,
            "last_native_id": self.last_native_id,
        }


class DurableRunCursor:
    """Stores continuation in the monitored scraper_runs JSON column.

    A local JSON file can be supplied for fixture/audit tests. Production mode
    requires the runner's exact scraper_runs row ID and uses source-scoped reads.
    """

    def __init__(self, scraper_id: str, *, session: requests.Session | None = None, local_path: str | None = None, audit: bool = False):
        self.scraper_id = scraper_id
        self.session = session or requests.Session()
        self.local_path = Path(local_path) if local_path else None
        self.audit = audit
        self.base = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.row_id = os.getenv("CVITAE_SCRAPER_RUN_DB_ID", "")

    def _headers(self) -> dict[str, str]:
        if not self.key:
            raise UpstreamFailure("CURSOR_UNAVAILABLE", "scraper_run_cursor_credentials_missing")
        return {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json", "Prefer": "return=minimal"}

    def load(self) -> Cursor:
        if self.local_path:
            try:
                return Cursor.from_payload(json.loads(self.local_path.read_text(encoding="utf-8")))
            except FileNotFoundError:
                return Cursor()
            except (json.JSONDecodeError, OSError):
                raise UpstreamFailure("CURSOR_UNAVAILABLE", "local_cursor_corrupt")
        if self.audit:
            return Cursor()
        if not self.base or not self.key:
            raise UpstreamFailure("CURSOR_UNAVAILABLE", "scraper_run_cursor_credentials_missing")
        url = f"{self.base}/rest/v1/scraper_runs"
        response = self.session.get(url, params={
            "select": "id,extraction_metrics,started_at",
            "scraper_id": f"eq.{self.scraper_id}",
            "order": "started_at.desc",
            "limit": "50",
        }, headers=self._headers(), timeout=(5, 15))
        response.raise_for_status()
        rows = response.json()
        for row in rows if isinstance(rows, list) else []:
            if str(row.get("id")) == self.row_id:
                continue
            metrics = row.get("extraction_metrics") or {}
            candidate = metrics.get("latam_cursor") if isinstance(metrics, dict) else None
            if isinstance(candidate, dict):
                cursor = Cursor.from_payload(candidate)
                if cursor.continuation_pending:
                    return cursor
                return Cursor()
        return Cursor()

    def save(self, cursor: Cursor, *, metrics: dict[str, Any] | None = None) -> None:
        if self.local_path:
            self.local_path.parent.mkdir(parents=True, exist_ok=True)
            self.local_path.write_text(json.dumps(cursor.payload(), ensure_ascii=False), encoding="utf-8")
            return
        if self.audit:
            return
        if not self.row_id or not self.base:
            raise UpstreamFailure("CURSOR_UNAVAILABLE", "exact_scraper_run_row_required_for_durable_cursor")
        payload = {"latam_cursor": cursor.payload(), **(metrics or {})}
        response = self.session.patch(
            f"{self.base}/rest/v1/scraper_runs?id=eq.{quote(self.row_id)}",
            json={"extraction_metrics": payload}, headers=self._headers(), timeout=(5, 15),
        )
        response.raise_for_status()

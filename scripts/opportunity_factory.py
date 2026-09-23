"""Incremental, zero-token opportunity sealing and local embeddings.

The worker reads bounded reviewable structural lanes plus a bounded eligible
embedding lane. It never publishes, approves, deletes, or changes source or
distribution flags.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scrapers.opportunity_sink import (
    CONTENT_FINGERPRINT_FIELDS,
    SEMANTIC_FINGERPRINT_FIELDS,
    _fingerprint,
)


MODEL_ID = "Supabase/gte-small"
MODEL_VERSION = "Supabase/gte-small@1"
PIPELINE_VERSION = "opportunity-factory-v1"
EMBEDDING_INPUT_VERSION = "opportunity-embedding-v2"
RULES_VERSION = "factory-rules-2026-09-10"
# The GitHub workflow deliberately remains bounded at 50 rows / 45 minutes.
# Within that bound, lanes reserve progress for new structural work, historical
# structural work, and vectors.  Structural sealing runs before the model is
# loaded, so a vector backlog cannot hold up identity/fingerprint sealing.
DEFAULT_FRESH_WINDOW_HOURS = 48
DEFAULT_STRUCTURAL_LIMIT = 100
DEFAULT_EMBEDDING_LIMIT = 20
MAX_STRUCTURAL_LIMIT = 250
MAX_EMBEDDING_LIMIT = 50
ALLOWED_TYPES = {
    "job", "internship", "consultancy", "scholarship", "fellowship", "grant",
    "seed_capital", "accelerator", "incubator", "startup_competition",
    "research_funding", "training", "exchange_program", "volunteering", "tender",
}


def clean_segment(value: Any, max_length: int) -> str:
    text = re.sub(r"<[^>]*>", " ", str(value or ""))
    text = re.sub(r"&nbsp;|&#160;", " ", text, flags=re.I)
    text = re.sub(r"&amp;", "&", text, flags=re.I)
    return " ".join(text.split())[:max_length]


def build_opportunity_embedding_text(row: dict[str, Any]) -> str:
    """Deterministic semantic input; never include URLs or raw source HTML."""
    tags = ", ".join(row.get("tags") or [])
    eligible = ", ".join(row.get("eligible_countries") or [])
    regions = ", ".join(row.get("eligible_regions") or [])
    parts = [
        f"Cargo: {clean_segment(row.get('title'), 180)}",
        f"Organización: {clean_segment(row.get('organization'), 140)}",
        f"Área: {clean_segment(row.get('rubro'), 120)}",
        f"Tipo: {clean_segment(row.get('type') or row.get('opportunity_type') or row.get('opportunity_kind'), 100)}",
        f"Skills: {clean_segment(tags, 320)}",
        f"Ubicación: {clean_segment(row.get('location'), 140)}",
        f"Países elegibles: {clean_segment(eligible or row.get('country_code'), 100)}",
        f"Descripción: {clean_segment(row.get('description'), 1000)}",
    ]
    # Keep location eligibility distinct while avoiding raw source URLs/HTML.
    parts.extend([
        f"Remote scope: {clean_segment(row.get('remote_scope'), 40)}",
        f"Eligible regions: {clean_segment(regions, 100)}",
    ])
    return " | ".join(part for part in parts if not part.endswith(": "))[:1800]


embedding_text = build_opportunity_embedding_text


def seal(row: dict[str, Any], now: datetime) -> tuple[str, dict[str, Any], dict[str, Any]]:
    stamps: dict[str, Any] = {}
    evidence: dict[str, Any] = {}
    parsed = urlparse(str(row.get("application_url") or ""))
    identity_ok = bool(clean_segment(row.get("title"), 240)) and parsed.scheme == "https" and bool(parsed.netloc)
    stamps["identity"] = "pass" if identity_ok else "block"
    evidence["identity"] = {"scheme": parsed.scheme or None, "host": parsed.hostname}

    authority_ok = row.get("source_authority") == "original" or row.get("original_source_verified") is True
    stamps["provenance"] = "pass" if authority_ok else "review"
    evidence["provenance"] = {
        "authority": row.get("source_authority"),
        "original_verified": row.get("original_source_verified") is True,
    }

    deadline_ok = True
    if row.get("deadline"):
        try:
            comparison_now = now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)
            deadline = datetime.fromisoformat(str(row["deadline"]).replace("Z", "+00:00"))
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=comparison_now.tzinfo or timezone.utc)
            deadline_ok = deadline >= comparison_now
        except ValueError:
            deadline_ok = False
    stamps["validity"] = "pass" if deadline_ok else "block"
    evidence["validity"] = {"deadline": row.get("deadline")}

    opportunity_type = row.get("opportunity_type")
    stamps["classification"] = "pass" if opportunity_type in ALLOWED_TYPES else "review"
    geo_known = bool(row.get("country_code") or row.get("eligible_countries") or row.get("eligible_regions") or row.get("remote"))
    stamps["geo"] = "pass" if geo_known else "review"
    content_length = len(clean_segment(row.get("description"), 5000))
    stamps["content"] = "pass" if content_length >= 80 else "review"
    evidence["content"] = {"description_length": content_length, "minimum_length": 80}

    # Provenance remains durable evidence, but it is deliberately not a
    # structural-seal failure. A certified aggregator can provide a valid,
    # identity-confirmed opportunity without pretending to be its employer.
    # The source-aware automation policy decides whether that ready row may
    # later move downstream.
    structural_stamps = {key: value for key, value in stamps.items() if key != "provenance"}
    if "block" in structural_stamps.values():
        status = "blocked"
    elif "review" in structural_stamps.values():
        status = "review"
    else:
        status = "ready"
    return status, stamps, evidence


def should_generate_embedding(row: dict[str, Any], status: str, *, dry_run: bool) -> bool:
    """Seal every eligible row, but vectorize only an existing match candidate.

    ``match_eligible`` is the persisted downstream gate today. A future
    Automation Core executor may grant it; hidden/pending rows must not cause
    local model work merely because their structural seal is ready.
    """
    return not dry_run and status in {"ready", "review"} and row.get("match_eligible") is True


def should_generate_embedding_in_run(
    row: dict[str, Any],
    status: str,
    *,
    dry_run: bool,
    embedding_lane_ids: set[str],
    maintenance_embedding_ids: bool = False,
) -> bool:
    """Keep structural sealing independent from bounded vector work."""
    lane_allowed = maintenance_embedding_ids or str(row["id"]) in embedding_lane_ids
    return lane_allowed and should_generate_embedding(row, status, dry_run=dry_run)


def structural_lane_minimums(structural_limit: int) -> dict[str, int]:
    """Protected minima, not maximum partitions, for structural work.

    At the conservative default of 100, fresh and historical work each get a
    minimum of 25 slots. The remaining 50 structural slots are deterministically
    borrowed by eligible work, preferring old backlog after both minima are met.
    """
    if structural_limit < 1:
        raise ValueError("structural limit must be positive")
    if structural_limit == 1:
        return {"fresh": 1, "backlog": 0, "embedding": 0}
    if structural_limit == 2:
        return {"fresh": 1, "backlog": 1, "embedding": 0}
    minimum = max(1, structural_limit // 4)
    return {"fresh": minimum, "backlog": minimum, "embedding": 0}


def lane_quotas(limit: int) -> dict[str, int]:
    """Legacy compatibility view of the old combined 50-row budget.

    New Factory runs use independent structural and embedding capacities. This
    helper remains for callers/tests that only need the former 50-row shape.
    """
    if limit < 1:
        raise ValueError("factory limit must be positive")
    if limit == 1:
        return {"fresh": 1, "backlog": 0, "embedding": 0}
    if limit == 2:
        return {"fresh": 1, "backlog": 1, "embedding": 0}
    fresh = max(1, (limit * 2) // 5)
    backlog = max(1, (limit * 2) // 5)
    return {"fresh": fresh, "backlog": backlog, "embedding": limit - fresh - backlog}


def fresh_cutoff(now: datetime, fresh_window_hours: int = DEFAULT_FRESH_WINDOW_HOURS) -> datetime:
    if fresh_window_hours < 1:
        raise ValueError("fresh window must be positive")
    current = now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)
    return current - timedelta(hours=fresh_window_hours)


class FactoryClient:
    def __init__(self) -> None:
        self.base = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        self.session = requests.Session()
        self.last_lane_selection: dict[str, list[str]] = {"fresh": [], "backlog": [], "embedding": []}
        self.last_lane_borrowed: dict[str, int] = {"fresh": 0, "backlog": 0, "embedding": 0}
        self.last_queue_before: dict[str, int | None] = {}

    @staticmethod
    def _count_from_response(response: Any) -> int | None:
        """Return an exact PostgREST count, preserving unavailable as unknown."""
        content_range = (getattr(response, "headers", {}) or {}).get("content-range")
        if not content_range or "/" not in content_range:
            return None
        total = content_range.rsplit("/", 1)[1]
        return int(total) if total.isdigit() else None

    @staticmethod
    def _structural_filters(cutoff: datetime, lane: str) -> dict[str, str]:
        if lane not in {"fresh", "backlog"}:
            raise ValueError(f"unknown structural lane: {lane}")
        timestamp = cutoff.astimezone(timezone.utc).isoformat()
        return {
            "verification_status": "in.(pending,in_review,verified)",
            "deleted_at": "is.null",
            "archived_at": "is.null",
            "factory_status": "in.(pending,failed)",
            # Rows imported by older emitters can have no updated_at. They are
            # historical backlog, never an invisible fourth lane.
            **({"updated_at": f"gte.{timestamp}"} if lane == "fresh" else {
                "or": f"(updated_at.lt.{timestamp},updated_at.is.null)",
            }),
        }

    @staticmethod
    def _embedding_filters() -> dict[str, str]:
        return {
            "match_eligible": "eq.true",
            "embedding": "is.null",
            "verification_status": "eq.verified",
            "is_active": "eq.true",
            "factory_status": "eq.ready",
            "deleted_at": "is.null",
            "archived_at": "is.null",
        }

    def _count_lane(self, params: dict[str, str]) -> int | None:
        try:
            response = self.session.get(
                f"{self.base}/opportunities",
                headers={**self.headers, "Prefer": "count=exact"},
                params={"select": "id", "limit": "1", **params},
                timeout=45,
            )
            response.raise_for_status()
            return self._count_from_response(response)
        except requests.RequestException:
            # Queue telemetry must never make a bounded Factory run pretend a
            # count is zero. The caller reports this as UNKNOWN/null.
            return None

    def queue_counts(self, now: datetime | None = None) -> dict[str, int | None]:
        current = now or datetime.now(timezone.utc)
        cutoff = fresh_cutoff(current, self.fresh_window_hours())
        return {
            "structural_fresh_pending": self._count_lane(self._structural_filters(cutoff, "fresh")),
            "structural_backlog_pending": self._count_lane(self._structural_filters(cutoff, "backlog")),
            "embedding_pending": self._count_lane(self._embedding_filters()),
        }

    @staticmethod
    def fresh_window_hours() -> int:
        raw = os.environ.get("FACTORY_FRESH_WINDOW_HOURS", str(DEFAULT_FRESH_WINDOW_HOURS))
        try:
            value = int(raw)
        except ValueError as exc:
            raise ValueError("FACTORY_FRESH_WINDOW_HOURS must be an integer") from exc
        return max(1, min(value, 24 * 14))

    def _fetch_lane(self, select: str, params: dict[str, str], lane: str, quota: int) -> list[dict[str, Any]]:
        if quota <= 0:
            return []
        # Fresh work has a protected lane already; FIFO inside that lane keeps
        # an individual newly-ingested row from being overtaken indefinitely by
        # later arrivals during sustained intake.
        order = "updated_at.asc,id.asc"
        response = self.session.get(
            f"{self.base}/opportunities",
            headers=self.headers,
            params={"select": select, **params, "order": order, "limit": str(quota)},
            timeout=45,
        )
        response.raise_for_status()
        return response.json()

    def candidates(
        self,
        structural_limit: int,
        *,
        embedding_limit: int = 0,
        now: datetime | None = None,
    ) -> list[dict[str, Any]]:
        fields = sorted(set(CONTENT_FINGERPRINT_FIELDS + SEMANTIC_FINGERPRINT_FIELDS + (
            "id", "updated_at", "factory_status", "embedding_model", "match_eligible",
            "embedding", "verification_status", "is_active",
        )))
        select = ",".join(fields)
        current = now or datetime.now(timezone.utc)
        cutoff = fresh_cutoff(current, self.fresh_window_hours())
        if structural_limit < 1 or embedding_limit < 0:
            raise ValueError("invalid Factory lane capacity")
        minima = structural_lane_minimums(structural_limit)
        self.last_queue_before = self.queue_counts(current)
        lane_filters = {
            "fresh": self._structural_filters(cutoff, "fresh"),
            "backlog": self._structural_filters(cutoff, "backlog"),
            "embedding": self._embedding_filters(),
        }
        selected: list[dict[str, Any]] = []
        selected_ids: set[str] = set()
        lane_ids: dict[str, list[str]] = {"fresh": [], "backlog": [], "embedding": []}
        fetched = {
            # Fetching no more than the bounded structural budget lets unused
            # minima be borrowed without an unbounded database read.
            "fresh": self._fetch_lane(select, lane_filters["fresh"], "fresh", structural_limit),
            "backlog": self._fetch_lane(select, lane_filters["backlog"], "backlog", structural_limit),
            "embedding": self._fetch_lane(select, lane_filters["embedding"], "embedding", embedding_limit),
        }

        def select_from(lane: str, rows: list[dict[str, Any]], maximum: int) -> int:
            accepted = 0
            for row in rows:
                if accepted >= maximum:
                    break
                row_id = str(row["id"])
                if row_id in selected_ids:
                    continue
                selected_ids.add(row_id)
                lane_ids[lane].append(row_id)
                selected.append(row)
                accepted += 1
            return accepted

        # Every non-empty structural lane first receives its protected minimum.
        fresh_taken = select_from("fresh", fetched["fresh"], minima["fresh"])
        backlog_taken = select_from("backlog", fetched["backlog"], minima["backlog"])
        remaining_structural = structural_limit - fresh_taken - backlog_taken
        # Work conservation: vacant minima are borrowed by old backlog first,
        # then fresh work. Borrowing never removes the other lane's minimum.
        backlog_extra = select_from("backlog", fetched["backlog"][backlog_taken:], remaining_structural)
        remaining_structural -= backlog_extra
        fresh_extra = select_from("fresh", fetched["fresh"][fresh_taken:], remaining_structural)
        select_from("embedding", fetched["embedding"], embedding_limit)
        self.last_lane_selection = lane_ids
        self.last_lane_borrowed = {"fresh": fresh_extra, "backlog": backlog_extra, "embedding": 0}
        return selected

    def candidates_by_ids(self, opportunity_ids: list[str]) -> list[dict[str, Any]]:
        """Bounded maintenance fetch: only active matching rows that need a vector."""
        if not opportunity_ids:
            return []
        fields = sorted(set(CONTENT_FINGERPRINT_FIELDS + SEMANTIC_FINGERPRINT_FIELDS + (
            "id", "updated_at", "factory_status", "embedding_model", "embedding",
        )))
        quoted = ",".join(f'"{str(value).replace(chr(34), "")}"' for value in opportunity_ids[:50])
        response = self.session.get(
            f"{self.base}/opportunities", headers=self.headers,
            params={"select": ",".join(fields), "id": f"in.({quoted})", "match_eligible": "eq.true", "deleted_at": "is.null", "archived_at": "is.null"}, timeout=45,
        )
        response.raise_for_status()
        return [row for row in response.json() if row.get("factory_status") in {"pending", "failed"} or row.get("embedding") is None]

    def seal_candidates_by_ids(self, opportunity_ids: list[str]) -> list[dict[str, Any]]:
        """Exact structural sealing before matching or embeddings are allowed."""
        if not opportunity_ids:
            return []
        fields = sorted(set(CONTENT_FINGERPRINT_FIELDS + SEMANTIC_FINGERPRINT_FIELDS + (
            "id", "updated_at", "factory_status", "embedding_model", "embedding",
        )))
        quoted = ",".join(f'"{str(value).replace(chr(34), "")}"' for value in opportunity_ids[:50])
        response = self.session.get(
            f"{self.base}/opportunities", headers=self.headers,
            params={"select": ",".join(fields), "id": f"in.({quoted})", "deleted_at": "is.null", "archived_at": "is.null"}, timeout=45,
        )
        response.raise_for_status()
        return [row for row in response.json() if row.get("factory_status") in {"pending", "failed"}]

    def commit(self, row: dict[str, Any], snapshot: dict[str, Any], vector: list[float] | None) -> None:
        response = self.session.post(
            f"{self.base}/rpc/opportunity_factory_commit_atomic",
            headers={**self.headers, "Prefer": "return=representation"},
            json={
                "p_id": row["id"],
                "p_expected_updated_at": row.get("updated_at"),
                "p_content_fingerprint": snapshot["content_fingerprint"],
                "p_semantic_fingerprint": snapshot["semantic_fingerprint"],
                "p_pipeline_version": snapshot["pipeline_version"],
                "p_rules_version": snapshot["rules_version"],
                "p_status": snapshot["status"],
                "p_stamps": snapshot["stamps"],
                "p_evidence": snapshot["evidence"],
                "p_embedding": vector,
                "p_embedding_model": snapshot["embedding_model"],
                "p_embedding_status": snapshot["embedding_status"],
                "p_checked_at": snapshot["checked_at"],
            },
            timeout=45,
        )
        response.raise_for_status()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, help="compatibilidad: reemplaza sólo el presupuesto estructural")
    parser.add_argument("--structural-limit", type=int, default=int(os.environ.get("FACTORY_STRUCTURAL_LIMIT", DEFAULT_STRUCTURAL_LIMIT)))
    parser.add_argument("--embedding-limit", type=int, default=int(os.environ.get("FACTORY_EMBEDDING_LIMIT", DEFAULT_EMBEDDING_LIMIT)))
    parser.add_argument("--ids", help="IDs de maintenance separados por comas (máximo 50)")
    parser.add_argument("--seal-ids", help="IDs exactos para sealing estructural, sin matching ni embeddings")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    structural_limit = max(1, min(args.limit if args.limit is not None else args.structural_limit, MAX_STRUCTURAL_LIMIT))
    embedding_limit = max(0, min(args.embedding_limit, MAX_EMBEDDING_LIMIT))
    client = FactoryClient()
    if args.ids and args.seal_ids:
        parser.error("--ids y --seal-ids son excluyentes")
    ids = [value.strip() for value in ((args.seal_ids or args.ids) or "").split(",") if value.strip()]
    if len(ids) > 50:
        parser.error("--ids admite como máximo 50 oportunidades")
    now = datetime.now(timezone.utc)
    rows = client.seal_candidates_by_ids(ids) if args.seal_ids else client.candidates_by_ids(ids) if ids else client.candidates(
        structural_limit, embedding_limit=embedding_limit, now=now,
    )
    model = None
    summary: dict[str, Any] = {
        "selected": len(rows), "ready": 0, "review": 0, "blocked": 0, "failed": 0, "embedded": 0,
        "structural_budget": structural_limit if not ids else 0,
        "embedding_budget": embedding_limit if not ids else 0,
        "fresh_minimum": structural_lane_minimums(structural_limit)["fresh"] if not ids else 0,
        "backlog_minimum": structural_lane_minimums(structural_limit)["backlog"] if not ids else 0,
        "fresh_selected": len(client.last_lane_selection["fresh"]) if not ids else 0,
        "backlog_selected": len(client.last_lane_selection["backlog"]) if not ids else 0,
        "embedding_selected": len(client.last_lane_selection["embedding"]) if not ids else 0,
        "borrowed_by_fresh": client.last_lane_borrowed["fresh"] if not ids else 0,
        "borrowed_by_backlog": client.last_lane_borrowed["backlog"] if not ids else 0,
        "borrowed_by_embedding": client.last_lane_borrowed["embedding"] if not ids else 0,
        "queue_before": client.last_queue_before if not ids else None,
    }
    embedding_lane_ids = set(client.last_lane_selection["embedding"]) if not ids else set()

    for row in rows:
        content_fingerprint = _fingerprint(row, CONTENT_FINGERPRINT_FIELDS)
        semantic_fingerprint = _fingerprint(row, SEMANTIC_FINGERPRINT_FIELDS)
        status, stamps, evidence = seal(row, now)
        vector = None
        error = None
        # Structural sealing deliberately never consumes vector capacity. Exact
        # maintenance IDs retain their historical embedding behavior; normal
        # scheduled work may vectorize only the independently selected lane.
        if should_generate_embedding_in_run(
            row, status, dry_run=args.dry_run, embedding_lane_ids=embedding_lane_ids,
            maintenance_embedding_ids=bool(ids and not args.seal_ids),
        ):
            try:
                if model is None:
                    from sentence_transformers import SentenceTransformer
                    model = SentenceTransformer(MODEL_ID)
                vector = model.encode(build_opportunity_embedding_text(row), normalize_embeddings=True).tolist()
                if len(vector) != 384:
                    raise ValueError(f"embedding_dimension_{len(vector)}")
                summary["embedded"] += 1
            except Exception as exc:  # keep the row retryable
                status = "failed"
                error = f"{type(exc).__name__}: {str(exc)[:300]}"

        summary[status] += 1
        snapshot = {
            "opportunity_id": row["id"],
            "content_fingerprint": content_fingerprint,
            "semantic_fingerprint": semantic_fingerprint,
            "pipeline_version": f"{PIPELINE_VERSION}:{EMBEDDING_INPUT_VERSION}",
            "rules_version": RULES_VERSION,
            "status": status,
            "stamps": stamps,
            "evidence": {**evidence, **({"error": error} if error else {})},
            "embedding_model": MODEL_VERSION if vector is not None else None,
            "embedding_status": "ready" if vector is not None else "failed" if status == "failed" else "pending",
            "source_updated_at": row.get("updated_at"),
            "checked_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        if args.dry_run:
            continue
        try:
            client.commit(row, snapshot, vector)
        except requests.HTTPError as exc:
            # A concurrent scraper/admin edit makes this attempt stale. The row
            # remains pending and the next incremental run recomputes it.
            if exc.response is not None and exc.response.status_code == 409:
                summary[status] -= 1
                summary["failed"] += 1
                continue
            raise

    if not ids:
        queue_after = client.queue_counts(now)
        summary["queue_after"] = queue_after
        summary["fresh_remaining"] = queue_after["structural_fresh_pending"]
        summary["backlog_remaining"] = queue_after["structural_backlog_pending"]
        summary["embedding_remaining"] = queue_after["embedding_pending"]
        known_remaining = list(queue_after.values())
        summary["unprocessed"] = sum(known_remaining) if all(value is not None for value in known_remaining) else None
        summary["structural_processed"] = summary["fresh_selected"] + summary["backlog_selected"]
    else:
        summary["queue_after"] = None
        summary["fresh_remaining"] = None
        summary["backlog_remaining"] = None
        summary["embedding_remaining"] = None
        summary["unprocessed"] = None
        summary["structural_processed"] = 0

    print("CVITAE_FACTORY_SUMMARY=" + json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

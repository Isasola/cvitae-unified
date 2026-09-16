"""Incremental, zero-token opportunity sealing and local embeddings.

The worker reads only pending/failed reviewable rows. It never publishes,
approves, deletes, or changes distribution flags.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
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

    def candidates(self, limit: int) -> list[dict[str, Any]]:
        fields = sorted(set(CONTENT_FINGERPRINT_FIELDS + SEMANTIC_FINGERPRINT_FIELDS + (
            "id", "updated_at", "factory_status", "embedding_model", "match_eligible",
            "embedding", "verification_status", "is_active",
        )))
        select = ",".join(fields)
        # Class A: structural sealing needed
        class_a_response = self.session.get(
            f"{self.base}/opportunities",
            headers=self.headers,
            params={
                "select": select,
                "verification_status": "in.(pending,in_review,verified)",
                "deleted_at": "is.null",
                "archived_at": "is.null",
                "factory_status": "in.(pending,failed)",
                "order": "updated_at.asc,id.asc",
                "limit": str(limit),
            },
            timeout=45,
        )
        class_a_response.raise_for_status()
        class_a = class_a_response.json()
        if len(class_a) >= limit:
            return class_a
        # Class B: embedding missing for already-ready verified active match candidates (B2C priority)
        remaining = limit - len(class_a)
        class_a_ids = {str(row["id"]) for row in class_a}
        class_b_response = self.session.get(
            f"{self.base}/opportunities",
            headers=self.headers,
            params={
                "select": select,
                "match_eligible": "eq.true",
                "embedding": "is.null",
                "verification_status": "eq.verified",
                "is_active": "eq.true",
                "factory_status": "eq.ready",
                "deleted_at": "is.null",
                "archived_at": "is.null",
                "order": "updated_at.asc,id.asc",
                "limit": str(remaining),
            },
            timeout=45,
        )
        class_b_response.raise_for_status()
        class_b = [row for row in class_b_response.json() if str(row["id"]) not in class_a_ids]
        return class_a + class_b

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
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--ids", help="IDs de maintenance separados por comas (máximo 50)")
    parser.add_argument("--seal-ids", help="IDs exactos para sealing estructural, sin matching ni embeddings")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    limit = max(1, min(args.limit, 1000))
    client = FactoryClient()
    if args.ids and args.seal_ids:
        parser.error("--ids y --seal-ids son excluyentes")
    ids = [value.strip() for value in ((args.seal_ids or args.ids) or "").split(",") if value.strip()]
    if len(ids) > 50:
        parser.error("--ids admite como máximo 50 oportunidades")
    rows = client.seal_candidates_by_ids(ids) if args.seal_ids else client.candidates_by_ids(ids) if ids else client.candidates(limit)
    now = datetime.now(timezone.utc)
    model = None
    summary = {"selected": len(rows), "ready": 0, "review": 0, "blocked": 0, "failed": 0, "embedded": 0}

    for row in rows:
        content_fingerprint = _fingerprint(row, CONTENT_FINGERPRINT_FIELDS)
        semantic_fingerprint = _fingerprint(row, SEMANTIC_FINGERPRINT_FIELDS)
        status, stamps, evidence = seal(row, now)
        vector = None
        error = None
        if should_generate_embedding(row, status, dry_run=args.dry_run):
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

    print("CVITAE_FACTORY_SUMMARY=" + json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

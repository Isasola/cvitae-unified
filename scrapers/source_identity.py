"""Deterministic, runtime-only identity checks for bounded enrichment canaries."""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
import re

from source_adapters import AdapterResult

TRACKING = {"fbclid", "gclid", "dclid", "mc_cid", "mc_eid"}


@dataclass(frozen=True)
class IdentityResult:
    status: str
    method: str
    confidence: float
    db_opportunity_id: str | None
    source_native_id: str | None
    db_source_url: str | None
    live_source_url: str | None
    reason: str


def normalize_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value.strip())
    if not parsed.scheme or not parsed.netloc:
        return None
    pairs = [(key, val) for key, val in parse_qsl(parsed.query, keep_blank_values=True)
             if not key.casefold().startswith("utm_") and key.casefold() not in TRACKING]
    path = parsed.path.rstrip("/") or "/"
    return urlunparse((parsed.scheme.casefold(), parsed.netloc.casefold(), path, "", urlencode(pairs, doseq=True), ""))


def native_id(source: str, url: str | None) -> str | None:
    normalized = normalize_url(url)
    if not normalized:
        return None
    parsed = urlparse(normalized)
    if source == "talentcom":
        match = re.search(r"(?:^|[?&])id=([^&]+)", parsed.query)
        return match.group(1) if match else None
    if source == "unjobs":
        match = re.search(r"/vacancies/(\d+)", parsed.path)
        return match.group(1) if match else None
    if source in {"himalayas", "weworkremotely"}:
        part = parsed.path.rstrip("/").split("/")[-1]
        return part or None
    return None


def confirm_identity(source: str, row: dict, result: AdapterResult) -> IdentityResult:
    db_urls = [value for value in (row.get("source_url"), row.get("application_url")) if value]
    db_normalized = {normalize_url(value) for value in db_urls if normalize_url(value)}
    db_native = {native_id(source, value) for value in db_urls if native_id(source, value)}
    live_native = result.source_native_id or native_id(source, result.canonical_url) or native_id(source, result.source_url)
    base = dict(db_opportunity_id=row.get("id"), source_native_id=live_native,
                db_source_url=row.get("source_url") or row.get("application_url"), live_source_url=result.source_url)
    if result.source_status == 410:
        return IdentityResult("REMOVED", "http_410", 1.0, reason="detail_removed", **base)
    if result.source_status == 404:
        return IdentityResult("DEAD", "http_404", 1.0, reason="detail_not_found", **base)
    if result.evidence.get("detail_match") is False:
        return IdentityResult("IDENTITY_MISMATCH", "detail_page_mismatch", 1.0, reason="detail_not_requested_advert", **base)
    if live_native and live_native in db_native:
        return IdentityResult("IDENTITY_CONFIRMED", "native_id_exact", 1.0, reason="native_id_matches_db_url", **base)
    for value in (result.canonical_url, result.source_url, result.apply_url):
        if normalize_url(value) in db_normalized:
            return IdentityResult("IDENTITY_CONFIRMED", "normalized_url_exact", .99, reason="stable_url_matches_db", **base)
    return IdentityResult("IDENTITY_UNRESOLVED", "no_strong_match", 0.0, reason="no_exact_native_or_url_match", **base)

"""Reliable Supabase ingestion shared by CVitae opportunity collectors."""
from __future__ import annotations

import os
import hashlib
import json
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


ALLOWED_FIELDS = {
    "id", "slug", "title", "organization", "location", "continent", "type", "rubro",
    "value", "deadline", "compatibility", "tags", "description",
    "application_url", "source", "recruiter_vacancy_id", "is_active",
    "verification_status", "verification_score", "verification_reasons",
    "country_code", "department", "city", "opportunity_kind", "opportunity_type",
    "eligible_countries", "eligible_regions", "remote", "onsite_country",
    "remote_scope",
    "funding_type", "funding_amount", "currency", "fully_funded", "deadline",
    "published_at", "age_min", "age_max", "education_level", "experience_required",
    "citizenship_requirement", "residency_requirement", "sector", "tags",
    "source_url", "source_authority", "original_source_url",
    "original_source_verified", "verified_at",
}

CONTENT_FINGERPRINT_FIELDS = (
    "title", "organization", "description", "application_url", "source", "deadline",
    "published_at", "country_code", "department", "city", "location", "remote",
    "onsite_country", "remote_scope", "eligible_countries", "eligible_regions", "opportunity_kind",
    "opportunity_type", "type", "rubro", "tags", "source_authority",
    "original_source_url", "original_source_verified", "age_min", "age_max",
    "education_level", "experience_required", "citizenship_requirement",
    "residency_requirement",
)

SEMANTIC_FINGERPRINT_FIELDS = (
    "title", "organization", "rubro", "type", "opportunity_type",
    "opportunity_kind", "tags", "location", "country_code", "remote", "remote_scope", "eligible_countries", "eligible_regions",
    "description",
)

GENERIC_TITLES = re.compile(
    r"^(login|concursos?|all jobs|types of opportunities|how we hire|internships|"
    r"terms of use|privacy notice|opens in a new tab\.?|facebook|instagram|linkedin|"
    r"fran[cç]ais|english(?: \(united states\))?|espa[ñn]ol|no results|"
    r"trabaj[áa] con nosotros|trabaja con nosotros|empleos? en |vacantes abiertas en |ver empleos en )",
    re.IGNORECASE,
)

KINDS = {"empleo", "beca", "pasantia", "concurso", "voluntariado", "curso", "intercambio", "conferencia", "programa"}
OPPORTUNITY_TYPES = {
    "job", "internship", "consultancy", "scholarship", "fellowship", "grant",
    "seed_capital", "accelerator", "incubator", "startup_competition",
    "research_funding", "training", "exchange_program", "volunteering", "tender",
}


def _infer_kind(kind: str, raw_type: str) -> str:
    normalized = unicodedata.normalize("NFKD", kind or raw_type).encode("ascii", "ignore").decode("ascii").casefold()
    if normalized in KINDS:
        return normalized
    for terms, result in (
        (("beca", "scholarship", "fellowship", "bursary"), "beca"),
        (("pasant", "internship"), "pasantia"),
        (("concurso", "competition"), "concurso"),
        (("voluntar", "volunteer"), "voluntariado"),
        (("curso", "course", "training"), "curso"),
        (("intercambio", "exchange"), "intercambio"),
        (("conferencia", "conference", "summit"), "conferencia"),
        (("capital semilla", "grant", "funding", "program", "programme", "oportunidad"), "programa"),
    ):
        if any(term in normalized for term in terms):
            return result
    return "empleo"


def _infer_type(value: str, legacy_kind: str, raw_type: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or raw_type).encode("ascii", "ignore").decode("ascii").casefold().replace("-", "_").replace(" ", "_")
    if normalized in OPPORTUNITY_TYPES:
        return normalized
    text = f"{normalized} {legacy_kind} {raw_type}".casefold()
    for terms, result in (
        (("consult",), "consultancy"), (("intern", "pasant"), "internship"),
        (("fellow",), "fellowship"), (("scholar", "beca"), "scholarship"),
        (("seed", "capital_semilla"), "seed_capital"), (("accelerat",), "accelerator"),
        (("incubat",), "incubator"), (("research_fund",), "research_funding"),
        (("tender", "licit"), "tender"), (("voluntar",), "volunteering"),
        (("exchange", "intercambio"), "exchange_program"), (("training", "curso"), "training"),
        (("competition", "concurso"), "startup_competition"), (("grant", "funding"), "grant"),
    ):
        if any(term in text for term in terms):
            return result
    return "job"


@dataclass
class IngestionSummary:
    found: int = 0
    valid: int = 0
    unique: int = 0
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    duplicates_in_run: int = 0
    rejected: int = 0
    budget_skipped: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)
    lineage_attempted: int = 0
    lineage_written: int = 0
    lineage_failed: int = 0

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        # ``processed`` remains for existing consumers; the explicit name
        # clarifies that persistence failures are attempted, never invisible.
        payload["processed_attempted"] = self.inserted + self.updated + self.unchanged + self.rejected + self.failed
        payload["processed"] = payload["processed_attempted"]
        payload["unprocessed_due_to_budget"] = self.budget_skipped
        payload["pipeline_traced"] = self.lineage_written
        payload["persisted_without_lineage"] = self.lineage_failed
        return payload


def _text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _fingerprint(item: dict[str, Any], fields: tuple[str, ...]) -> str:
    payload: dict[str, Any] = {}
    for key in fields:
        value = item.get(key)
        if isinstance(value, list):
            value = sorted({_text(entry, 500) for entry in value if _text(entry, 500)})
        elif isinstance(value, str):
            value = _text(value, 5000)
        payload[key] = value
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _slug(title: str, application_url: str) -> str:
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-z0-9]+", "-", ascii_title.lower()).strip("-")[:72] or "empleo"
    suffix = hashlib.sha1(application_url.encode("utf-8")).hexdigest()[:8]
    return f"{base}-{suffix}"


PY_DEPARTMENTS = {
    "asunción": "Capital", "san lorenzo": "Central", "luque": "Central",
    "capiatá": "Central", "fernando de la mora": "Central", "mariano roque alonso": "Central",
    "limpio": "Central", "lambaré": "Central", "ciudad del este": "Alto Paraná",
    "hernandarias": "Alto Paraná", "presidente franco": "Alto Paraná", "minga guazú": "Alto Paraná",
    "encarnación": "Itapúa", "caaguazú": "Caaguazú",
}


def _normalize_py_geo(item: dict[str, Any]) -> None:
    if item.get("source") != "computrabajo" and str(item.get("country_code") or "").upper() != "PY":
        return
    parts = [_text(part, 120) for part in str(item.get("location") or "").split(",") if _text(part, 120)]
    if len(parts) > 1 and parts[0].casefold() == parts[1].casefold():
        parts = parts[:1] + parts[2:]
    city = parts[0] if parts else ""
    item["location"] = ", ".join(parts) or "Paraguay"
    item["country_code"] = "PY"
    item["city"] = item.get("city") or city or None
    item["department"] = item.get("department") or PY_DEPARTMENTS.get(city.casefold()) or (parts[1] if len(parts) > 1 else None)


def normalize_opportunity(raw: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    item = {key: value for key, value in raw.items() if key in ALLOWED_FIELDS}
    item["title"] = _text(item.get("title"), 240)
    item["application_url"] = _text(item.get("application_url"), 2000)
    if not item["title"]:
        return None, "title vacío"
    if GENERIC_TITLES.search(item["title"]):
        return None, "título genérico o de navegación"
    if " " in item["application_url"]:
        from urllib.parse import quote as _url_quote
        item["application_url"] = _url_quote(item["application_url"], safe='/:?=&#%@+')
    if not item["application_url"].startswith(("https://", "http://")):
        return None, "application_url inválida"
    item["slug"] = _text(item.get("slug"), 120) or _slug(item["title"], item["application_url"])

    for key, limit in {
        "organization": 240,
        "location": 240,
        "continent": 80,
        "type": 100,
        "rubro": 160,
        "value": 160,
        "description": 12000,
        "source": 120,
    }.items():
        if key in item:
            item[key] = _text(item[key], limit)

    tags = item.get("tags")
    item["tags"] = list(dict.fromkeys(_text(tag, 80) for tag in tags or [] if _text(tag, 80)))[:20]
    item["source"] = item.get("source") or "scraper"
    item["is_active"] = bool(item.get("is_active", True))
    kind = _text(item.get("opportunity_kind"), 40).casefold()
    raw_type = _text(item.get("type"), 100).casefold()
    item["opportunity_kind"] = _infer_kind(kind, raw_type)
    item["opportunity_type"] = _infer_type(_text(item.get("opportunity_type"), 60), item["opportunity_kind"], raw_type)
    authority = _text(item.get("source_authority"), 20).casefold() or "aggregator"
    item["source_authority"] = authority if authority in {"original", "aggregator", "discovery"} else "discovery"
    item["original_source_verified"] = bool(item.get("original_source_verified", item["source_authority"] == "original"))
    for key in ("eligible_countries", "eligible_regions"):
        values = item.get(key) or []
        item[key] = list(dict.fromkeys(_text(value, 80) for value in values if _text(value, 80)))[:100]
    location_folded = unicodedata.normalize("NFKD", _text(item.get("location"), 240)).encode("ascii", "ignore").decode("ascii").casefold()
    if not item.get("country_code") and any(term in location_folded for term in ("paraguay", "asuncion", "san lorenzo", "luque", "ciudad del este", "encarnacion")):
        item["country_code"] = "PY"
    _normalize_py_geo(item)
    allowed_countries = {value.strip().upper() for value in os.getenv("CVITAE_ALLOWED_COUNTRIES", "").split(",") if value.strip()}
    country = _text(item.get("country_code"), 2).upper()
    if allowed_countries and country not in allowed_countries:
        return None, f"país fuera de política: {country or 'sin país'}"
    item["content_fingerprint"] = _fingerprint(item, CONTENT_FINGERPRINT_FIELDS)
    item["semantic_fingerprint"] = _fingerprint(item, SEMANTIC_FINGERPRINT_FIELDS)
    item["factory_status"] = "pending"
    return item, None


class OpportunitySink:
    def __init__(self, supabase_url: str | None = None, service_key: str | None = None):
        self.audit_mode = os.getenv("CVITAE_AUDIT_MODE", "0") == "1"
        self.supabase_url = (supabase_url or os.getenv("SUPABASE_URL", "")).rstrip("/")
        self.service_key = service_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not self.audit_mode and (not self.supabase_url or not self.service_key):
            raise RuntimeError("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios")
        self.table_url = f"{self.supabase_url}/rest/v1/opportunities"
        self.session = requests.Session()
        self.session.mount("https://", HTTPAdapter(max_retries=Retry(
            total=3,
            connect=3,
            read=3,
            backoff_factor=0.8,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset(("GET", "POST")),
        )))
        self.headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "X-CVitae-Sink": "1",
        }

    def _existing_urls(self, urls: list[str], chunk_size: int = 40) -> dict[str, dict[str, Any]]:
        existing: dict[str, dict[str, Any]] = {}
        for start in range(0, len(urls), chunk_size):
            chunk = urls[start:start + chunk_size]
            expression = ",".join(f'"{url.replace(chr(34), "")}"' for url in chunk)
            response = self.session.get(
                self.table_url,
                headers=self.headers,
                params={"select": "id,application_url,source,slug,verification_status,is_active,catalog_eligible,match_eligible,alerts_eligible,seo_eligible,content_fingerprint,semantic_fingerprint", "application_url": f"in.({expression})"},
                timeout=30,
            )
            response.raise_for_status()
            existing.update({row["application_url"]: row for row in response.json()})
        return existing

    @staticmethod
    @lru_cache(maxsize=512)
    def _canonical_source(emitted_source: Any) -> tuple[str | None, str | None]:
        emitted = _text(emitted_source, 120).casefold()
        if not emitted:
            return None, "SOURCE_IDENTITY_MISSING"
        # Registry V2 owns source identity. Unknown/ambiguous emitters remain
        # visible in ingestion evidence; they are never guessed from a label.
        try:
            import sys
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            from source_registry_v2 import resolve_emitted_source
            return resolve_emitted_source(emitted).source, None
        except (ImportError, ValueError):
            return None, "SOURCE_IDENTITY_UNRESOLVED"

    def _persist_ingestion_lineage(
        self,
        accepted: list[tuple[dict[str, Any], str]],
        rejected: list[tuple[dict[str, Any], str]],
        existing: dict[str, dict[str, Any]],
    ) -> None:
        """Record producer receipt, not live/HTTP/identity evidence.

        Opportunity rows are already persisted at this point. A lineage error
        is reported separately and never rolled back or disguised as an
        observation. Missing run metadata remains explicit in the event.
        """
        self._lineage_pending_events = []
        if self.audit_mode or (not accepted and not rejected):
            return
        run_id = _text(os.getenv("CVITAE_SCRAPER_RUN_ID"), 200) or None
        scraper_run_id = _text(os.getenv("CVITAE_SCRAPER_RUN_DB_ID"), 80) or None
        producer_id = _text(os.getenv("CVITAE_SCRAPER_ID"), 160) or None
        scan_request_id = _text(os.getenv("CVITAE_SOURCE_SCAN_REQUEST_ID"), 200) or None
        received_at = datetime.now(timezone.utc).isoformat()
        events: list[dict[str, Any]] = []
        for item, outcome in [*accepted, *rejected]:
            url = item.get("application_url")
            prior = existing.get(str(url)) if url else None
            opportunity_id = (prior or {}).get("id")
            # Newly upserted IDs are resolved from persisted rows below.
            emitted = item.get("source") or (prior or {}).get("source")
            canonical, identity_reason = self._canonical_source(emitted)
            reason = identity_reason
            if not producer_id:
                reason = reason or "SCRAPER_IDENTITY_NOT_SUPPLIED"
            if not run_id:
                reason = reason or "SCRAPER_RUN_ID_NOT_SUPPLIED"
            if outcome in {"REJECTED", "BUDGET_SKIPPED", "PERSISTENCE_FAILED"}:
                reason = item.get("reason") or outcome
            identity_hash = hashlib.sha256(str(url or json.dumps(item, sort_keys=True, default=str)).encode("utf-8")).hexdigest()
            # A random event key is intentional when there is no durable run
            # id; it does not fabricate one or claim idempotence across runs.
            event_key_seed = "|".join((str(opportunity_id or identity_hash), str(run_id or uuid.uuid4()), str(producer_id or "UNKNOWN"), outcome, str(item.get("content_fingerprint") or "")))
            events.append({
                "event_key": hashlib.sha256(event_key_seed.encode("utf-8")).hexdigest(),
                "opportunity_id": opportunity_id,
                "emitted_source": _text(emitted, 120) or None,
                "canonical_source": canonical,
                "producer_id": producer_id,
                "adapter_id": _text(os.getenv("CVITAE_ADAPTER_VERSION"), 120) or None,
                "cleaner_id": _text(os.getenv("CVITAE_CLEANER_ID"), 120) or None,
                "normalizer_version": "opportunity-sink:v1",
                "normalized_fields": sorted(item.keys()),
                "run_id": run_id,
                "scraper_run_id": scraper_run_id,
                "scan_request_id": scan_request_id,
                "outcome": outcome,
                "trace_state": "TRACED" if not reason else "INCOMPLETE",
                "reason": reason,
                "identity_sha256": identity_hash,
                "content_fingerprint": item.get("content_fingerprint"),
                "semantic_fingerprint": item.get("semantic_fingerprint"),
                "evidence": {"evidence_kind": "INGESTION_RECEIPT", "is_source_observation": False, "is_http_evidence": False, "received_at": received_at},
            })
        # Resolve rows inserted in this batch after the upsert; this lookup is
        # factual persistence linkage, not identity or observation evidence.
        unresolved = [e for e in events if e["opportunity_id"] is None and e["outcome"] not in {"REJECTED", "BUDGET_SKIPPED", "PERSISTENCE_FAILED"}]
        if unresolved:
            try:
                persisted = self._existing_urls([str(item.get("application_url") or "") for item, _ in accepted])
                for event in unresolved:
                    # Hash matching avoids retaining an extra raw URL in the
                    # event and resolves via the submitted item ordering.
                    match = next((item for item, _ in accepted if hashlib.sha256(str(item.get("application_url") or "").encode("utf-8")).hexdigest() == event["identity_sha256"]), None)
                    row = persisted.get(str(match.get("application_url"))) if match else None
                    if row:
                        event["opportunity_id"] = row.get("id")
                    if not event["opportunity_id"]:
                        event["trace_state"] = "INCOMPLETE"
                        event["reason"] = "PERSISTED_OPPORTUNITY_ID_UNRESOLVED"
            except requests.RequestException:
                pass
        self._lineage_pending_events = events

    def _flush_ingestion_lineage(self) -> tuple[int, int]:
        events = getattr(self, "_lineage_pending_events", [])
        self._lineage_pending_events = []
        if not events or self.audit_mode:
            return 0, 0
        response = self.session.post(
            f"{self.supabase_url}/rest/v1/opportunity_ingestion_events?on_conflict=event_key",
            headers={**self.headers, "Prefer": "resolution=ignore-duplicates,return=minimal"},
            json=events,
            timeout=45,
        )
        if response.status_code not in (200, 201, 204):
            raise requests.HTTPError(f"ingestion_lineage_http_{response.status_code}")
        return len(events), 0

    def insert_new_fail_closed(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Insert precisely one new opportunity without any conflict resolution.

        This is intentionally not a variant of ``upsert``: a collision is a
        hard error and must never turn into an update of an historical row.
        The direct request avoids this sink's retry-enabled POST session, so a
        failed canary insert is never retried as an implicit duplicate write.
        """
        if self.audit_mode:
            raise RuntimeError("insert_fail_closed_unavailable_in_audit_mode")
        response = requests.post(
            self.table_url,
            headers={**self.headers, "Prefer": "return=representation"},
            json=payload,
            timeout=45,
        )
        if response.status_code not in {200, 201}:
            raise RuntimeError(f"insert_fail_closed_http_{response.status_code}")
        try:
            rows = response.json()
        except ValueError as exc:
            raise RuntimeError("insert_fail_closed_bad_response") from exc
        if not isinstance(rows, list) or len(rows) != 1:
            raise RuntimeError("insert_fail_closed_bad_response")
        persisted = rows[0]
        try:
            url = str(payload.get("application_url") or "")
            self._persist_ingestion_lineage([(payload, "INSERTED")], [], {url: persisted})
            self._flush_ingestion_lineage()
        except (requests.RequestException, RuntimeError) as exc:
            # The no-retry insert remains persisted; surface the split outcome
            # so callers cannot mistake it for a fully traced result.
            raise RuntimeError("insert_succeeded_but_lineage_persistence_failed") from exc
        return persisted

    def upsert(self, raw_items: Iterable[dict[str, Any]], batch_size: int = 100) -> IngestionSummary:
        raw_list = list(raw_items)
        summary = IngestionSummary(found=len(raw_list))
        rejected_lineage: list[tuple[dict[str, Any], str]] = []
        max_items = max(1, int(os.getenv("CVITAE_MAX_ITEMS", "1000")))
        unique: dict[str, dict[str, Any]] = {}
        duplicate_lineage: list[tuple[dict[str, Any], str]] = []
        for raw in raw_list:
            item, reason = normalize_opportunity(raw)
            if not item:
                summary.rejected += 1
                rejected_lineage.append(({"source": raw.get("source"), "application_url": raw.get("application_url"), "reason": reason}, "REJECTED"))
                if len(summary.errors) < 10:
                    summary.errors.append(reason or "oportunidad inválida")
                continue
            summary.valid += 1
            if os.getenv("CVITAE_REQUIRE_REVIEW", "0") == "1":
                item["verification_status"] = "in_review"
                item["is_active"] = False
            # Aggregators and discovery feeds may find leads, but they cannot
            # become public until the original publisher has been verified.
            if item.get("source_authority") != "original" and not item.get("original_source_verified"):
                item["verification_status"] = "in_review"
                item["is_active"] = False
            if item["application_url"] in unique:
                duplicate_lineage.append((item, "DUPLICATE_IN_RUN"))
            unique[item["application_url"]] = item

        summary.unique = len(unique)
        summary.duplicates_in_run = summary.valid - summary.unique
        items = list(unique.values())
        if len(items) > max_items:
            summary.budget_skipped += len(items) - max_items
            summary.errors.append(f"Límite operativo aplicado: {max_items} de {len(items)} oportunidades únicas")
            rejected_lineage.extend(({**item, "reason": "PROCESSING_BUDGET_SKIPPED"}, "BUDGET_SKIPPED") for item in items[max_items:])
            items = items[:max_items]
        if not items:
            self._write_audit(summary, items)
            if not self.audit_mode and rejected_lineage:
                self._persist_ingestion_lineage([], [*rejected_lineage, *duplicate_lineage], {})
                summary.lineage_attempted = len(self._lineage_pending_events)
                try:
                    summary.lineage_written, _ = self._flush_ingestion_lineage()
                except requests.RequestException as exc:
                    summary.lineage_failed = summary.lineage_attempted
                    summary.errors.append(f"No se pudo persistir ingestion lineage: {type(exc).__name__}")
            return summary

        if self.audit_mode:
            self._write_audit(summary, items)
            return summary

        try:
            existing = self._existing_urls(list(unique))
        except requests.RequestException as exc:
            summary.errors.append(f"No se pudo consultar deduplicación previa: {type(exc).__name__}")
            summary.failed += len(items)
            rejected_lineage.extend(({**item, "reason": "PRE_PERSISTENCE_LOOKUP_FAILED"}, "PERSISTENCE_FAILED") for item in items)
            self._persist_ingestion_lineage([], [*rejected_lineage, *duplicate_lineage], {})
            summary.lineage_attempted = len(self._lineage_pending_events)
            try:
                summary.lineage_written, _ = self._flush_ingestion_lineage()
            except requests.RequestException as lineage_exc:
                summary.lineage_failed = summary.lineage_attempted
                summary.errors.append(f"No se pudo persistir ingestion lineage: {type(lineage_exc).__name__}")
            return summary

        # Preserve the first public slug when a source later corrects its title.
        # This keeps indexed URLs and shared links stable across updates.
        changed_items: list[dict[str, Any]] = []
        lineage_items: list[tuple[dict[str, Any], str]] = []
        for item in items:
            previous = existing.get(item["application_url"])
            if previous and previous.get("slug"):
                item["slug"] = _text(previous["slug"], 120)
            if previous and previous.get("content_fingerprint") == item["content_fingerprint"]:
                summary.unchanged += 1
                lineage_items.append((item, "UNCHANGED"))
                continue
            if previous and previous.get("verification_status") == "verified":
                if previous.get("content_fingerprint"):
                    item["verification_status"] = "in_review"
                    item["is_active"] = False
                    for field in ("catalog_eligible", "match_eligible", "alerts_eligible", "seo_eligible"):
                        item[field] = False
                    item["verification_reasons"] = ["Contenido modificado por la fuente; requiere revalidación"]
                else:
                    # Bootstrap rows created before fingerprints without taking them offline.
                    item["verification_status"] = "verified"
                    item["is_active"] = bool(previous.get("is_active"))
                    for field in ("catalog_eligible", "match_eligible", "alerts_eligible", "seo_eligible"):
                        item[field] = bool(previous.get(field))
            changed_items.append(item)

        items = changed_items
        for start in range(0, len(items), batch_size):
            batch = items[start:start + batch_size]
            # Normalize: all rows in batch must have identical keys for Supabase REST
            all_keys = set().union(*(row.keys() for row in batch))
            batch = [{k: row.get(k) for k in all_keys} for row in batch]
            try:
                response = self.session.post(
                    f"{self.table_url}?on_conflict=application_url",
                    headers={**self.headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
                    json=batch,
                    timeout=60,
                )
                if response.status_code not in (200, 201, 204):
                    summary.failed += len(batch)
                    summary.errors.append(f"Supabase {response.status_code}: {_text(response.text, 800)}")
                    rejected_lineage.extend(({**item, "reason": f"OPPORTUNITY_UPSERT_HTTP_{response.status_code}"}, "PERSISTENCE_FAILED") for item in batch)
                    continue
                updated = sum(item["application_url"] in existing for item in batch)
                summary.updated += updated
                summary.inserted += len(batch) - updated
                lineage_items.extend((item, "UPDATED" if item["application_url"] in existing else "INSERTED") for item in batch)
            except requests.RequestException as exc:
                summary.failed += len(batch)
                summary.errors.append(f"Error de red al insertar lote: {type(exc).__name__}")
                rejected_lineage.extend(({**item, "reason": f"OPPORTUNITY_UPSERT_{type(exc).__name__}"}, "PERSISTENCE_FAILED") for item in batch)
        self._persist_ingestion_lineage(lineage_items, [*rejected_lineage, *duplicate_lineage], existing)
        summary.lineage_attempted = len(self._lineage_pending_events)
        try:
            summary.lineage_written, _ = self._flush_ingestion_lineage()
        except requests.RequestException as exc:
            summary.lineage_failed = summary.lineage_attempted
            summary.errors.append(f"No se pudo persistir ingestion lineage: {type(exc).__name__}")
        return summary

    def _write_audit(self, summary: IngestionSummary, items: list[dict[str, Any]]) -> None:
        if not self.audit_mode:
            return
        output = os.getenv("CVITAE_AUDIT_OUTPUT")
        if not output:
            return
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"summary": summary.to_dict(), "sample": items[:1000]}, ensure_ascii=False, indent=2), encoding="utf-8")

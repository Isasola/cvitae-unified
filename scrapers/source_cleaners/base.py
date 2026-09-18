"""Small, explicit source-maintenance contract."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True)
class SourceProfile:
    source: str
    adapter_version: str
    auto_enabled: bool
    expected_description_coverage: float
    semantic_version: str = "source-contract:v2.0"
    active: bool = True
    adapter: str | None = None
    cleaner: str | None = None
    scout: str = "db_observations"
    discovery_strategy: str = "unknown"
    detail_strategy: str = "none"
    source_family: str = "unclassified"
    opportunity_kinds: tuple[str, ...] = field(default_factory=tuple)
    freshness_ttl_hours: int = 168
    max_detail_fetches_per_run: int = 250
    min_workers: int = 2
    max_workers: int = 4
    connect_timeout_seconds: float = 5.0
    read_timeout_seconds: float = 20.0
    expected_live_parse_rate: float = 0.70
    max_identity_mismatch_rate: float = 0.35
    max_detail_mismatch_rate: float = 0.25
    retry_attempts: int = 2
    retry_base_seconds: float = 1.0
    supports_geo: bool = True
    supports_remote_scope: bool = True
    supports_eligibility: bool = False
    known_assumptions: tuple[str, ...] = field(default_factory=tuple)
    emitted_aliases: tuple[str, ...] = field(default_factory=tuple)
    emitted_patterns: tuple[str, ...] = field(default_factory=tuple)
    # Runner IDs as stored in scraper_runs.scraper_id (e.g. "unjobs_scraper").
    # When empty, admin-data.ts derives them by appending _scraper/_scrapper.
    operational_runner_ids: tuple[str, ...] = field(default_factory=tuple)
    certification: tuple[str, ...] = field(default_factory=tuple)
    # Evidence belongs to the same source-contract record as the declared
    # certification requirement. It is metadata only: it never grants a
    # lifecycle/publication action by itself.
    certification_evidence: Mapping[str, Mapping[str, Any]] = field(default_factory=dict)
    # Distribution is a source policy assertion, never an inheritance from a
    # registered/unvalidated profile.  Sources opt in explicitly only.
    web_catalog_allowed: bool = False
    source_attribution_required: bool = False
    third_party_job_distribution_allowed: bool = False
    google_jobs_distribution_allowed: bool = False
    # Tri-state organic SEO policy: None = legacy (seo_enabled DB flag governs),
    # True = policy permits SEO consideration (gates + quality still required),
    # False = explicitly denied regardless of other flags.
    # Himalayas and API sources with TOS restrictions set this to False.
    search_engine_indexing_allowed: bool | None = None

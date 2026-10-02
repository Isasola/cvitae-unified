"""Shared declared applicant-eligibility truth for non-matching consumers.

This intentionally answers only whether a row has explicit normalized
applicant eligibility.  Work arrangement and job geography never fill the
gap.  Matching owns candidate-specific eligibility; automation only needs to
know whether its input is structurally evidenced.
"""
from __future__ import annotations

import re
from typing import Any


JOB_GEO_PLACEHOLDERS = {"remote", "global", "worldwide", "anywhere", "work from anywhere", "home-based", "home based", "telecommute"}
CANONICAL_ELIGIBILITY_REGIONS = {"GLOBAL", "LATAM", "NORTH_AMERICA", "AMERICAS", "EUROPE", "EMEA", "ASIA", "AFRICA", "OCEANIA"}


def normalize_eligibility_region(value: str | None) -> str | None:
    """Normalize one explicit opportunity eligibility-region label, narrowly."""
    text = " ".join(str(value or "").casefold().split())
    matches = []
    for pattern, region in (
        (r"\b(worldwide|anywhere in (?:the )?world|all countries|global)\b", "GLOBAL"),
        (r"\b(latam|latin america|south america)\b", "LATAM"),
        (r"\bnorth america\b", "NORTH_AMERICA"), (r"\bamericas\b", "AMERICAS"),
        (r"\beurope\b|\beu only\b", "EUROPE"), (r"\bemea\b", "EMEA"),
        (r"\b(asia|apac)\b", "ASIA"), (r"\bafrica\b", "AFRICA"), (r"\boceania\b", "OCEANIA"),
    ):
        if re.search(pattern, text): matches.append(region)
    return matches[0] if len(matches) == 1 else None


def has_explicit_job_geography(row: dict[str, Any]) -> bool:
    """True only for concrete workplace geography, never eligibility/modality."""
    location = " ".join(str(row.get("location") or "").split())
    return bool(
        row.get("country_code")
        or row.get("onsite_country")
        or (location and location.casefold() not in JOB_GEO_PLACEHOLDERS)
    )


def declared_eligibility_state(row: dict[str, Any]) -> str:
    countries = [str(value).strip() for value in (row.get("eligible_countries") or []) if str(value).strip()]
    regions = [str(value).strip() for value in (row.get("eligible_regions") or []) if str(value).strip()]
    return "DECLARED" if countries or regions else "UNKNOWN"


def eligibility_resolved(row: dict[str, Any]) -> bool:
    """True only for explicit structured applicant eligibility evidence."""
    return declared_eligibility_state(row) == "DECLARED"


def work_arrangement_state(row: dict[str, Any]) -> str:
    """Return only arrangement facts explicitly represented by source data."""
    if row.get("remote") is True:
        return "REMOTE"
    scope = str(row.get("remote_scope") or "").upper()
    return scope if scope in {"ONSITE", "HYBRID"} else "UNKNOWN"


def geo_decision_ready(row: dict[str, Any]) -> bool:
    """Routing readiness without pretending remote eligibility is job geo.

    Onsite/hybrid work needs concrete workplace geography. Explicitly remote
    work may route safely with explicit applicant eligibility even when no
    physical office has been declared.
    """
    arrangement = work_arrangement_state(row)
    if arrangement == "REMOTE": return eligibility_resolved(row)
    if arrangement in {"ONSITE", "HYBRID"}: return has_explicit_job_geography(row)
    return False

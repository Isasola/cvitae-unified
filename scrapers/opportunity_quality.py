"""Kind-aware data quality, shared by source queues and maintenance.

This is quality/readiness evidence, not publication or matching policy.  In
particular a scholarship is not a degraded *job* just because it has no job
city or onsite country.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


JOB_TYPES = {"job", "internship", "consultancy"}
FUNDING_TYPES = {"scholarship", "fellowship", "grant", "seed_capital", "research_funding", "accelerator", "incubator", "startup_competition", "exchange_program", "training"}


@dataclass(frozen=True)
class OpportunityQualityProfile:
    name: str
    requires_job_geo: bool
    expects_organization: bool = True
    expects_description: bool = True
    expects_application_url: bool = True


JOB_PROFILE = OpportunityQualityProfile("job", requires_job_geo=True)
FUNDING_PROFILE = OpportunityQualityProfile("funding_or_program", requires_job_geo=False)
GENERAL_PROFILE = OpportunityQualityProfile("general", requires_job_geo=False)


def profile_for(row: dict[str, Any]) -> OpportunityQualityProfile:
    kind = str(row.get("opportunity_type") or "").casefold()
    if kind in JOB_TYPES:
        return JOB_PROFILE
    if kind in FUNDING_TYPES:
        return FUNDING_PROFILE
    return GENERAL_PROFILE


def quality_signals_for(row: dict[str, Any]) -> list[str]:
    """Only signal fields the item's own semantic contract genuinely needs."""
    profile = profile_for(row)
    description = str(row.get("description") or "").strip()
    location = str(row.get("location") or "").strip().casefold()
    country = str(row.get("country_code") or "").strip().upper()
    signals: list[str] = []
    if profile.expects_description and len(description) < 80:
        signals.append("missing_description")
    if profile.expects_organization and not str(row.get("organization") or "").strip():
        signals.append("missing_organization")
    if profile.expects_application_url and not str(row.get("application_url") or "").strip():
        signals.append("missing_application_url")
    # source_url is required for detail maintenance, but is not a substitute
    # for opportunity quality and never turns a scholarship into a bad job.
    if not str(row.get("source_url") or "").strip():
        signals.append("missing_source_url")
    if profile.requires_job_geo:
        if country in {"", "WW"}:
            signals.append("bad_country")
        if not location or location in {"unknown", "worldwide", "remote"}:
            signals.append("missing_or_weak_location")
        if row.get("remote_scope") in {"ONSITE", "HYBRID"} and not str(row.get("onsite_country") or "").strip():
            signals.append("missing_onsite_country")
    return signals


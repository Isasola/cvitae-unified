"""Shared append-only observation boundary; dry-run by default."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any
import requests
from source_evidence import ObservationCandidate

def validate(candidate: ObservationCandidate) -> None:
    if not candidate.run_id: raise ValueError("observation_run_id_required")
    if not candidate.source or not candidate.opportunity_id: raise ValueError("observation_identity_required")
    if candidate.identity_status == "IDENTITY_CONFIRMED" and (not candidate.canonical_url or candidate.http_status != 200): raise ValueError("exact_live_identity_required")
    if candidate.identity_status in {"DEAD","REMOVED"} and candidate.http_status not in {404,410}: raise ValueError("hard_dead_requires_404_410")

def dedupe(candidates: list[ObservationCandidate], latest: dict[str, dict[str,Any]], *, now: datetime, ttl_hours: int=24) -> tuple[list[ObservationCandidate],int]:
    kept=[]; skipped=0
    for item in candidates:
        validate(item); old=latest.get(item.opportunity_id) or {}
        try: at=datetime.fromisoformat(str(old.get('observed_at') or '').replace('Z','+00:00'))
        except ValueError: at=None
        same=old.get('identity_status')==item.identity_status and old.get('http_status')==item.http_status and old.get('canonical_url')==item.canonical_url
        if same and at and at >= now-timedelta(hours=ttl_hours): skipped+=1; continue
        kept.append(item)
    return kept,skipped

def write(candidates: list[ObservationCandidate], *, base_url: str, headers: dict[str,str], apply: bool=False, session: requests.Session|None=None) -> dict[str,Any]:
    for item in candidates: validate(item)
    if not apply: return {'mode':'DRY_RUN','commit':False,'candidates':len(candidates)}
    response=(session or requests.Session()).post(base_url.rstrip('/')+'/opportunity_source_observations',headers={**headers,'Prefer':'return=minimal'},json=[x.to_payload() for x in candidates],timeout=30)
    response.raise_for_status(); return {'mode':'APPLY','commit':True,'persisted':len(candidates)}

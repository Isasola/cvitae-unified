"""Validate CVitae's source intake registry without network or database writes."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "scrapers" / "source_registry.json"


def main() -> None:
    data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    allowed_types = set(data.get("proposed_types") or [])
    allowed_tiers = {"A", "B", "C"}
    # `review_required` remains a supported intake state used by the public ATS connectors.
    allowed_statuses = {"untested", "research_pending", "research_verified", "candidate", "active", "paused", "broken", "review_required"}
    seen: set[str] = set()
    errors: list[str] = []
    for index, source in enumerate(data.get("sources") or [], start=1):
        source_id = str(source.get("source_id") or "")
        if not source_id or source_id in seen:
            errors.append(f"sources[{index}]: source_id vacío o duplicado: {source_id!r}")
        seen.add(source_id)
        if source.get("source_tier") not in allowed_tiers:
            errors.append(f"{source_id}: source_tier inválido")
        if source.get("kind") not in allowed_types:
            errors.append(f"{source_id}: kind inválido: {source.get('kind')!r}")
        if source.get("status") not in allowed_statuses:
            errors.append(f"{source_id}: status inválido: {source.get('status')!r}")
        parsed = urlparse(str(source.get("start_url") or ""))
        if parsed.scheme != "https" or not parsed.netloc:
            errors.append(f"{source_id}: start_url debe ser HTTPS")
        if source.get("source_tier") != "A" and not source.get("original_source_required"):
            errors.append(f"{source_id}: Tier B/C debe exigir fuente original")
        if source_id == "paraguayconcursa_mef":
            control = source.get("operational_control") or {}
            if source.get("collection_enabled") is not False or source.get("initial_is_enabled") is not False:
                errors.append(f"{source_id}: collection and source gates must start closed")
            if control.get("scraper_id") != "paraguayconcursa_mef_scraper":
                errors.append(f"{source_id}: operational control scraper_id mismatch")
            if control.get("max_items_per_run") != 20 or control.get("max_runtime_seconds") != 900:
                errors.append(f"{source_id}: unsafe initial budget or runtime")
    if errors:
        raise SystemExit("\n".join(errors))
    print(json.dumps({"valid": True, "sources": len(seen), "by_tier": {tier: sum(1 for row in data["sources"] if row["source_tier"] == tier) for tier in sorted(allowed_tiers)}}, ensure_ascii=False))


if __name__ == "__main__":
    main()

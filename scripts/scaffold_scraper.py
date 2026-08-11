"""Create and register a quarantined CVitae scraper from the standard template."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_id")
    parser.add_argument("start_url")
    parser.add_argument("--market", default="PY")
    parser.add_argument("--kind", default="job")
    parser.add_argument("--tier", choices=("A", "B", "C"), default="B")
    args = parser.parse_args()
    source_id = re.sub(r"[^a-z0-9_]+", "_", args.source_id.lower()).strip("_")
    if not source_id: raise SystemExit("source_id inválido")
    target = ROOT / "scrapers" / f"{source_id}_scraper.py"
    if target.exists(): raise SystemExit(f"Ya existe: {target}")
    template = (ROOT / "scrapers" / "templates" / "scraper_template.py").read_text(encoding="utf-8")
    target.write_text(template.replace("__SOURCE_ID__", source_id).replace("__START_URL__", args.start_url), encoding="utf-8")
    registry_path = ROOT / "scrapers" / "source_registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    registry["sources"].append({
        "source_id": source_id,
        "script": f"scrapers/{target.name}",
        "start_url": args.start_url,
        "market": args.market.upper(),
        "kind": args.kind,
        "source_tier": args.tier,
        "status": "untested",
        "original_source_required": args.tier != "A",
        "collection_enabled": False,
        "catalog_enabled": False,
        "matching_enabled": False,
        "alerts_enabled": False,
        "seo_enabled": False,
    })
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"created": str(target), "registered": source_id, "safe_defaults": registry["defaults"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Generate the Admin-consumable registry artifact from the Python V2 core."""
from __future__ import annotations
import hashlib, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_registry_v2 import registry_snapshot
output = ROOT / "src" / "generated" / "source-intelligence-registry.json"

WORKFLOW_FILES = (
    ".github/workflows/scrapers.yml",
    ".github/workflows/source-maintenance.yml",
    ".github/workflows/scheduled-source-automation.yml",
    ".github/workflows/scrapers-latam.yml",
)
RUNNER = re.compile(r"python\s+scripts/run_scraper_monitored\.py\s+([\w.-]+)\s+([\w.-]+)\s+([\w./-]+\.py)")

def workflow_route_projection():
    routes = []
    for workflow in WORKFLOW_FILES:
        path = ROOT / workflow
        if not path.is_file():
            raise SystemExit(f"source_workflow_route_input_missing:{workflow}")
        content = path.read_text(encoding="utf-8")
        for match in RUNNER.finditer(content):
            routes.append({
                "workflow": workflow,
                "runner_id": match.group(1).lower(),
                "entrypoint": match.group(3).replace("\\", "/").lower(),
            })
    return routes

snapshot = registry_snapshot()
workflow_routes = workflow_route_projection()
snapshot["workflow_routes"] = workflow_routes
snapshot["workflow_routes_hash"] = hashlib.sha256(
    json.dumps(workflow_routes, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
).hexdigest()
payload = json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
if "--check" in sys.argv:
    current = output.read_text(encoding="utf-8") if output.exists() else ""
    if current != payload:
        raise SystemExit("source_intelligence_registry_snapshot_stale")
    print(f"CVITAE_SOURCE_REGISTRY_SNAPSHOT_FRESH={output}")
else:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")
    print(f"CVITAE_SOURCE_REGISTRY_SNAPSHOT={output}")

"""Generate the Admin-consumable registry artifact from the Python V2 core."""
from __future__ import annotations
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_registry_v2 import registry_snapshot
output = ROOT / "src" / "generated" / "source-intelligence-registry.json"
payload = json.dumps(registry_snapshot(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
if "--check" in sys.argv:
    current = output.read_text(encoding="utf-8") if output.exists() else ""
    if current != payload:
        raise SystemExit("source_intelligence_registry_snapshot_stale")
    print(f"CVITAE_SOURCE_REGISTRY_SNAPSHOT_FRESH={output}")
else:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")
    print(f"CVITAE_SOURCE_REGISTRY_SNAPSHOT={output}")

"""Offline contract for a captured 34-row effective-routing policy projection."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_cleaners import PROFILES

names = ["computrabajo", "himalayas", "unjobs"] + [name for name in sorted(PROFILES) if name not in {"computrabajo", "himalayas", "unjobs"}][:31]
assert len(names) == 34
base = {"is_enabled": True, "catalog_enabled": False, "matching_enabled": False, "alerts_enabled": False, "seo_enabled": False, "web_catalog_allowed": False, "search_engine_indexing_allowed": None, "google_jobs_distribution_allowed": False, "third_party_job_distribution_allowed": False}
rows = [{"source": name, **base} for name in names]
by_source = {row["source"]: row for row in rows}
by_source["computrabajo"].update({"catalog_enabled": True, "matching_enabled": True, "alerts_enabled": True, "seo_enabled": True, "web_catalog_allowed": False})
by_source["himalayas"].update({"web_catalog_allowed": True, "search_engine_indexing_allowed": False, "source_attribution_required": True})
by_source["unjobs"].update({"web_catalog_allowed": False, "search_engine_indexing_allowed": False})

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    baseline = root / "baseline.json"
    baseline.write_text(json.dumps({"policies": rows}), encoding="utf-8")
    env = {**os.environ, "EFFECTIVE_ROUTING_PRODUCTION_BASELINE": str(baseline), "EFFECTIVE_ROUTING_PROJECTION_OUTPUT_DIR": str(root / "out")}
    result = subprocess.run([sys.executable, str(ROOT / "scripts" / "generate_effective_routing_policy_projection.py")], env=env, capture_output=True, text=True, check=True)
    projection = json.loads((root / "out" / "effective-routing-policy-projection.json").read_text(encoding="utf-8"))
    assert len(projection["sources"]) == 34
    entries = {item["canonical_source"]: item for item in projection["sources"]}
    h = entries["himalayas"]
    assert h["desired"]["matching_enabled"] is True and h["desired"]["alerts_enabled"] is True
    assert h["desired"]["search_engine_indexing_allowed"] is False and h["desired"]["google_jobs_distribution_allowed"] is False
    assert h["decision_state"] == "KEEP_DENIED"
    u = entries["unjobs"]
    assert u["desired"]["matching_enabled"] is True and u["desired"]["alerts_enabled"] is True
    assert u["desired"]["search_engine_indexing_allowed"] is None
    assert u["evidence"]["search_indexing"] == "CONFIG_ONLY"
    c = entries["computrabajo"]
    assert c["desired"]["seo_enabled"] is True and c["desired"]["search_engine_indexing_allowed"] is None
    assert c["decision_state"] == "NEEDS_PERMISSION_EVIDENCE"
    executable = [line.strip().lower() for line in (root / "out" / "effective-routing-policy-preview.sql").read_text(encoding="utf-8").splitlines() if not line.strip().startswith("--")]
    assert not any(line.startswith("update ") for line in executable)
    print("verify_effective_routing_policy_projection: PASS sources=34 Himalayas=keep_denied UNJobs=config_not_contract Computrabajo=external_unknown")

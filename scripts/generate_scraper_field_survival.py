"""Generate the offline scraper universe and field-survival contract.

This is intentionally conservative: a literal emitted field is PERSISTED only
when OpportunitySink accepts it. Fields not evidenced in a scraper stay UNKNOWN
instead of being presented as source absence.
"""
from __future__ import annotations

import ast
import itertools
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from opportunity_sink import ALLOWED_FIELDS
from source_registry_v2 import PROFILES, resolve_emitted_source

FIELDS = [
    "title", "organization", "description", "location", "city", "department", "country_code",
    "eligible_countries", "eligible_regions", "remote", "remote_scope", "work_arrangement",
    "employment_type", "type", "opportunity_type", "opportunity_kind", "deadline", "value",
    "currency", "tags", "requirements", "application_url", "source_url", "source_authority",
    "original_source_url", "education_level", "experience_required",
]
# These are adapter-boundary transformations, not inferred source data.  The
# source field survives through a supported OpportunitySink field under the
# same evidence chain (for example AdapterResult.employment_type -> type).
PERSISTED_VIA = {
    "employment_type": "type",
    "work_arrangement": "remote_scope",
    "requirements": "eligible_countries",
}
WORKFLOW = ROOT / ".github" / "workflows" / "scrapers.yml"
OUTPUT = ROOT / "generated" / "scraper-field-survival.json"


def workflow_emitters() -> list[Path]:
    text = WORKFLOW.read_text(encoding="utf-8")
    paths = sorted({match for match in re.findall(r"scrapers/([\w-]+\.py)", text) if (ROOT / "scrapers" / match).exists()})
    return [ROOT / "scrapers" / path for path in paths]


def literal_fields(path: Path) -> set[str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="ignore"))
    except SyntaxError:
        return set()
    fields: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            for key in node.keys:
                if isinstance(key, ast.Constant) and isinstance(key.value, str) and key.value in FIELDS:
                    fields.add(key.value)
    return fields


def _literal_collection(node: ast.AST, collections: dict[str, list[str]]) -> list[str] | None:
    """Return deterministic loop keys, never execute scraper code.

    Dynamic source families are only accepted when their values can be proved
    from a static list/tuple/dict in the emitter.  This is deliberately more
    conservative than treating a source prefix as a source identity.
    """
    if isinstance(node, ast.Name):
        return collections.get(node.id)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "items":
        return _literal_collection(node.func.value, collections)
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        values: list[str] = []
        for item in node.elts:
            if isinstance(item, ast.Constant) and isinstance(item.value, str):
                values.append(item.value)
            elif isinstance(item, (ast.Tuple, ast.List)) and item.elts and isinstance(item.elts[0], ast.Constant) and isinstance(item.elts[0].value, str):
                values.append(item.elts[0].value)
            else:
                return None
        return values
    if isinstance(node, ast.Dict):
        values = []
        for key in node.keys:
            if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
                return None
            values.append(key.value)
        return values
    return None


def _static_bindings(tree: ast.AST) -> tuple[dict[str, str], dict[str, list[str]], dict[str, list[str]]]:
    constants: dict[str, str] = {}
    collections: dict[str, list[str]] = {}
    for node in getattr(tree, "body", []):
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        value = node.value
        for target in targets:
            if not isinstance(target, ast.Name):
                continue
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                constants[target.id] = value.value
            else:
                collection = _literal_collection(value, collections)
                if collection is not None:
                    collections[target.id] = collection
    loop_values: dict[str, list[str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.For):
            continue
        values = _literal_collection(node.iter, collections)
        if not values:
            continue
        targets = node.target.elts if isinstance(node.target, (ast.Tuple, ast.List)) else [node.target]
        if targets and isinstance(targets[0], ast.Name):
            loop_values.setdefault(targets[0].id, []).extend(values)
    return constants, collections, {key: sorted(set(value)) for key, value in loop_values.items()}


def _expand_source_value(value: ast.AST, constants: dict[str, str], loop_values: dict[str, list[str]]) -> set[str]:
    if isinstance(value, ast.Constant) and isinstance(value.value, str):
        return {value.value.casefold()}
    if isinstance(value, ast.Name) and value.id in constants:
        return {constants[value.id].casefold()}
    if not isinstance(value, ast.JoinedStr):
        return set()
    parts: list[list[str]] = []
    for item in value.values:
        if isinstance(item, ast.Constant) and isinstance(item.value, str):
            parts.append([item.value])
        elif isinstance(item, ast.FormattedValue) and isinstance(item.value, ast.Name) and item.value.id in loop_values:
            parts.append(loop_values[item.value.id])
        else:
            return set()
    return {"".join(values).casefold() for values in itertools.product(*parts)}


def emitted_sources(path: Path) -> set[str]:
    """Discover emitted IDs from the active workflow's static emitter code.

    Supports literal dict values, ``SOURCE``/``SOURCE_ID`` constants and
    dynamic source families backed by static loop collections.  We do not
    execute the scraper or guess unresolved dynamic values.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="ignore"))
    except SyntaxError:
        return set()
    constants, _collections, loop_values = _static_bindings(tree)
    values = {value.casefold() for name, value in constants.items() if name in {"SOURCE", "SOURCE_ID"}}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        for key, value in zip(node.keys, node.values):
            if isinstance(key, ast.Constant) and key.value == "source":
                values.update(_expand_source_value(value, constants, loop_values))
    return values


def main() -> int:
    emitters = workflow_emitters()
    active: dict[str, list[Path]] = {}
    unknown_emitted: set[str] = set()
    for path in emitters:
        for raw in emitted_sources(path):
            try:
                canonical = resolve_emitted_source(raw).source
            except ValueError:
                unknown_emitted.add(raw)
                continue
            active.setdefault(canonical, []).append(path)
    profiles = set(PROFILES)
    classifications = {}
    for canonical in sorted(profiles):
        classifications[canonical] = "ACTIVE_EMITTER" if canonical in active else "REGISTERED_NO_ROWS"
    # Static, non-workflow source literals provide historical evidence only.
    for path in (ROOT / "scrapers").glob("*.py"):
        if path in emitters:
            continue
        for raw in emitted_sources(path):
            try:
                canonical = resolve_emitted_source(raw).source
            except ValueError:
                unknown_emitted.add(raw)
                continue
            if classifications.get(canonical) == "REGISTERED_NO_ROWS":
                classifications[canonical] = "HISTORICAL_ONLY"
    source_fields: dict[str, set[str]] = {canonical: set() for canonical in profiles}
    source_files: dict[str, set[str]] = {canonical: set() for canonical in profiles}
    for path in emitters:
        fields = literal_fields(path)
        for raw in emitted_sources(path):
            try:
                canonical = resolve_emitted_source(raw).source
            except ValueError:
                continue
            source_fields[canonical].update(fields); source_files[canonical].add(path.name)
    sources = []
    totals = {"PERSISTED": 0, "LOST_BEFORE_PERSISTENCE": 0, "UNKNOWN": 0,
              "NOT_PROVIDED_BY_SOURCE": 0, "FAILED_EXTRACTION": 0}
    for canonical in sorted(profiles):
        emitted = source_fields[canonical]
        matrix = {}
        for field in FIELDS:
            if field not in emitted:
                state = "UNKNOWN"
            elif field in ALLOWED_FIELDS or PERSISTED_VIA.get(field) in ALLOWED_FIELDS:
                state = "PERSISTED"
            else:
                state = "LOST_BEFORE_PERSISTENCE"
            matrix[field] = state
            if state == "PERSISTED": totals["PERSISTED"] += 1
            elif state == "LOST_BEFORE_PERSISTENCE": totals["LOST_BEFORE_PERSISTENCE"] += 1
            else: totals["UNKNOWN"] += 1
        sources.append({"canonical_source": canonical, "classification": classifications[canonical], "emitter_files": sorted(source_files[canonical]), "fields": matrix,
                        "persistence_transforms": {field: PERSISTED_VIA[field] for field in emitted if field in PERSISTED_VIA}})
    category_counts = {key: sum(item["classification"] == key for item in sources) for key in ("ACTIVE_EMITTER", "HISTORICAL_ONLY", "REGISTERED_NO_ROWS")}
    category_counts["UNKNOWN_SOURCE"] = len(unknown_emitted)
    payload = {"schema_version": "scraper-field-survival:v1", "sources": sources, "category_counts": category_counts, "unknown_emitted_sources": sorted(unknown_emitted), "field_totals": totals}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print("SCRAPER_FIELD_SURVIVAL=" + json.dumps({"categories": category_counts, "fields": totals}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

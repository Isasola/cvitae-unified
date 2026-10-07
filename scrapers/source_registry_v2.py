"""Deterministic canonical/emitted/family source resolution and certification.

This is core-only metadata. Frontends consume its snapshots; they never infer
source ownership from a display string.

``live_validation`` may be declared only after real provider data has passed
live fetch, canonical identity, semantic normalization and conservative
exception validation, plus a production-safe dry-run or canary where relevant.
The declaration is backed by ``SourceProfile.certification_evidence``; neither
certification nor that evidence enables autonomous maintenance by itself.
"""
from __future__ import annotations

import re
import hashlib
import json
import ast
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from source_cleaners import PROFILES, SourceProfile

REQUIRED_CERTIFICATION = (
    "canonical_identity", "semantic_version", "quality_profile", "freshness_policy",
    "dead_policy", "restore_policy", "observations", "dry_run", "live_validation", "matching_gates", "seo_gates",
)

# Emitted production identifiers are explicit. Patterns are intentionally
# narrow; a profile collision is an error rather than a heuristic choice.
EXPLICIT_EMITTED_ALIASES = {
    "talent": "talentcom", "talent.com": "talentcom", "wwr": "weworkremotely", "we-work-remotely": "weworkremotely", "un-jobs": "unjobs",
    "automotriz_py": "automotriz", "fundacionparaguaya": "fundacion",
    "logistica_transporte_py": "logistica_transporte", "medios_py": "medios_comunicacion",
    "oyaop": "oya", "clasipar": "scrapper", "cc_atento": "callcenters",
    "ong_bid_py": "ongs", "ong_giz_py": "ongs", "ong_oas_py": "ongs",
    "abc_color": "abc", "abc_scrapper": "abc", "aptitus_pe": "aptitus", "bumeran_pe": "bumeran",
    "computrabajo_pe": "computrabajo", "energia_utilities_py": "energia_utilities",
    "googlejobs": "googlejobs_v2", "grupo_cartes": "grupocarteshs", "grupo_vierci": "grupovierci",
    "indeed_pe": "indeed", "jooble_pe": "jooble", "laborum_pe": "laborum",
    "reddit_py": "reddit", "reddit_py_trabajo": "reddit", "retail_malls_py": "retail_malls",
    "telecomunicaciones_py": "telecomunicaciones", "zonajobs_py": "foros", "seguros_unimedica": "seguros",
    "agroindustria_py": "agroindustria", "bolsas_locales_py": "bolsas_locales", "cde_frontera_py": "cde_frontera",
    "farmacias_py": "farmacias", "foroparaguay": "foros", "frigorificos_py": "frigorificos",
    "gastronomia_hoteles_py": "gastronomia_hoteles", "industria_manufactura_py": "industria_manufactura",
    "puertos_importadoras_py": "puertos_importadoras", "mtess": "empleapy_mtess",
    "copaco": "copaco", "hireon": "hireon", "idealist": "idealist", "itau": "itau",
    "merienderos": "merienderos", "ofertaslaborales": "ofertaslaborales", "personal": "personal",
    "pivot_jobs": "pivot_jobs", "reliefweb": "reliefweb", "scholarship_corner": "scholarship_corner", "tigo": "tigo",
}
EXPLICIT_EMITTED_PATTERNS = {
    r"^cc_[a-z0-9_]+$": "callcenters",
    # These families are emitted dynamically by workflow-backed legacy
    # scrapers.  Registry V2 owns the family mapping; consumers never infer
    # it from a display label or a one-off emitted ID.
    r"^banco_[a-z0-9_]+$": "bancos",
    r"^const_[a-z0-9_]+$": "constructoras",
    r"^coop_[a-z0-9_]+$": "cooperativas",
    r"^hosp_[a-z0-9_]+$": "hospitales",
    r"^ong_[a-z0-9_]+$": "ongs",
    # Keep the existing retail_malls and retail_malls_py aliases owned by
    # retail_malls rather than allowing the generic family to capture them.
    r"^retail_(?!malls(?:_py)?$)[a-z0-9_]+$": "supermercados",
    r"^seguros_[a-z0-9_]+$": "seguros",
    r"^tech_[a-z0-9_]+$": "tech_local",
    r"^univ_[a-z0-9_]+$": "universidades",
}


def _claims(profile: SourceProfile) -> tuple[set[str], list[re.Pattern[str]]]:
    aliases = {profile.source, *profile.emitted_aliases}
    aliases.update(alias for alias, canonical in EXPLICIT_EMITTED_ALIASES.items() if canonical == profile.source)
    patterns = [re.compile(value) for value, canonical in EXPLICIT_EMITTED_PATTERNS.items() if canonical == profile.source]
    patterns.extend(re.compile(value) for value in profile.emitted_patterns)
    return {value.casefold() for value in aliases}, patterns


def validate_registry(profiles: Iterable[SourceProfile] | None = None) -> dict:
    items = list(profiles or PROFILES.values())
    owners: dict[str, list[str]] = {}
    for profile in items:
        aliases, _ = _claims(profile)
        for alias in aliases: owners.setdefault(alias, []).append(profile.source)
    collisions = {alias: values for alias, values in owners.items() if len(set(values)) > 1}
    patterns: list[tuple[str, str]] = [(pattern.pattern, profile.source) for profile in items for pattern in _claims(profile)[1]]
    ambiguous_patterns: list[tuple[str, str, str]] = []
    for index, (left, owner) in enumerate(patterns):
        for right, other in patterns[index + 1:]:
            if owner != other and (left == right or left.startswith("^") and right.startswith("^") and left.split("[")[0] == right.split("[")[0]):
                ambiguous_patterns.append((left, owner, other))
    # Exact aliases have higher precedence at resolution time, but allowing a
    # different family to claim one hides a registry authoring mistake.  Make
    # it visible at build time instead of silently choosing the exact owner.
    alias_pattern_conflicts: list[tuple[str, str, str, str]] = []
    for alias, alias_owners in owners.items():
        for pattern, pattern_owner in patterns:
            if re.fullmatch(pattern, alias) and pattern_owner not in alias_owners:
                alias_pattern_conflicts.append((alias, alias_owners[0], pattern, pattern_owner))
    return {"valid": not collisions and not ambiguous_patterns and not alias_pattern_conflicts, "aliases": owners, "alias_collisions": collisions, "ambiguous_patterns": ambiguous_patterns, "alias_pattern_conflicts": alias_pattern_conflicts}


def resolve_emitted_source(emitted_source: str, profiles: Iterable[SourceProfile] | None = None) -> SourceProfile:
    emitted = str(emitted_source or "").strip().casefold()
    if not emitted: raise ValueError("unresolved_emitted_source")
    items = list(profiles or PROFILES.values())
    validation = validate_registry(items)
    if not validation["valid"]: raise ValueError("source_registry_validation_failed")
    exact = [profile for profile in items if emitted in _claims(profile)[0]]
    if len(exact) == 1: return exact[0]
    if len(exact) > 1: raise ValueError("ambiguous_emitted_source")
    matched = [profile for profile in items if any(pattern.fullmatch(emitted) for pattern in _claims(profile)[1])]
    if len(matched) == 1: return matched[0]
    if len(matched) > 1: raise ValueError("ambiguous_emitted_source")
    raise ValueError("unresolved_emitted_source")


def emitted_ids_for(canonical_source: str, known_emitted: Iterable[str] | None = None) -> tuple[str, ...]:
    """Return the DB source IDs belonging to a canonical profile, deterministically."""
    profile = resolve_emitted_source(canonical_source)
    candidates = set(_claims(profile)[0])
    for emitted in known_emitted or ():
        try:
            if resolve_emitted_source(emitted).source == profile.source:
                candidates.add(str(emitted).casefold())
        except ValueError:
            continue
    return tuple(sorted(candidates))


def discover_static_emitters(root: Path | None = None) -> set[str]:
    """Conservative literal scan; dynamic emitters require registry patterns."""
    root = root or Path(__file__).resolve().parents[1]
    values: set[str] = set()
    patterns = (
        re.compile(r"\bsource\s*[:=]\s*['\"]([a-z][a-z0-9_]*)['\"]", re.I),
        re.compile(r"['\"]source['\"]\s*:\s*['\"]([a-z][a-z0-9_]*)['\"]", re.I),
    )
    for folder in (root / "scrapers", root / "scripts"):
        for path in folder.rglob("*.py"):
            if "verify_" in path.name: continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for pattern in patterns:
                values.update(match.casefold() for match in pattern.findall(text))
    return values


def certification(profile: SourceProfile) -> dict:
    present = set(profile.certification) | {"canonical_identity", "semantic_version", "quality_profile", "freshness_policy", "dead_policy", "restore_policy", "observations", "matching_gates", "seo_gates"}
    if profile.adapter and profile.cleaner and profile.scout != "none": present.add("dry_run")
    missing = [item for item in REQUIRED_CERTIFICATION if item not in present]
    certified = not missing and bool(profile.adapter) and bool(profile.cleaner)
    return {
        "canonical_source": profile.source,
        "source_family": profile.source_family,
        "adapter_version": profile.adapter_version,
        "semantic_version": profile.semantic_version,
        "certified": certified,
        "missing": missing,
        "auto_enabled": profile.auto_enabled,
        "evidence": dict(profile.certification_evidence),
    }


@lru_cache(maxsize=1)
def executable_producers() -> dict[str, tuple[str, ...]]:
    """Repository entrypoints + exact emitted identities; never imports/runs a scraper.

    A workflow ID is a producer identity only when its script actually exists
    and has a main entrypoint. Literal aliases emitted by a shared script belong
    to their canonical profile, not independent producers. Metadata alone is
    insufficient (e.g. googlejobs_v3 actually emits googlejobs -> googlejobs_v2).
    """
    root = Path(__file__).resolve().parents[1]
    workflow = (root / ".github/workflows/scrapers.yml").read_text(encoding="utf-8")
    bindings: dict[str, set[str]] = {}
    for run_id, path in re.findall(r"run_scraper_monitored\.py\s+(\S+)\s+\S+\s+(scrapers/[^\s]+\.py)", workflow):
        bindings.setdefault(path, set()).add(re.sub(r"(?:_scraper|_scrapper)$", "", run_id))
    for row in json.loads((root / "scrapers/source_registry.json").read_text(encoding="utf-8"))["sources"]:
        if row.get("script"):
            bindings.setdefault(row["script"], set()).add(row["source_id"])
    # Direct CLI producers may predate the workflow/JSON entrypoint list.
    # Only main implementations with exact emitted identities count; filenames
    # or aliases alone never activate a profile.
    for target in (root / "scrapers").glob("*.py"):
        bindings.setdefault(target.relative_to(root).as_posix(), set())
    result: dict[str, set[str]] = {}
    for path, declared in bindings.items():
        target = (root / path).resolve()
        if not target.is_relative_to(root.resolve()) or not target.is_file():
            continue
        tree = ast.parse(target.read_text(encoding="utf-8-sig"))
        if not any(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == "main" for n in ast.walk(tree)):
            continue
        emitted: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Dict):
                emitted.update(v.value for k, v in zip(node.keys, node.values)
                    if isinstance(k, ast.Constant) and k.value == "source" and isinstance(v, ast.Constant) and isinstance(v.value, str))
            elif isinstance(node, ast.keyword) and node.arg == "source" and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                emitted.add(node.value.value)
            elif isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                if any(isinstance(t, ast.Name) and t.id in ("SOURCE", "SOURCE_ID", "source") for t in node.targets):
                    emitted.add(node.value.value)
        canonical = set()
        for value in emitted:
            try: canonical.add(resolve_emitted_source(value).source)
            except ValueError: continue
        # Workflow family bindings cover dynamic emitted IDs. An explicit
        # literal identity supersedes a misleading workflow/filename alias.
        if not canonical:
            for value in declared:
                try: canonical.add(resolve_emitted_source(value).source)
                except ValueError: continue
        for source in canonical:
            result.setdefault(source, set()).add(path)
    return {source: tuple(sorted(paths)) for source, paths in result.items()}


def operational_default(profile: SourceProfile) -> bool:
    """Executable producer defaults ACTIVE; manual intent is a separate DB audit."""
    return profile.source in executable_producers()


def runtime_projection(profile: SourceProfile) -> dict:
    """Return the policy-only, durable DB mirror for one SourceProfile.

    The registry remains authoritative.  This payload deliberately excludes
    descriptions, evidence timestamps and counters so its hash changes only
    when a mutation-time policy decision changes.
    """
    certificate = certification(profile)
    payload = {
        "source": profile.source,
        "registry_certified": certificate["certified"],
        "registry_auto_enabled": bool(profile.auto_enabled),
        "registry_automation_enabled": bool(profile.active),
        "registry_semantic_version": profile.semantic_version,
        "registry_adapter_version": profile.adapter_version,
        "registry_automation_policy_version": "opportunity_automation:v1",
        # Distinct clocks: projection sync, source-run health, and row
        # freshness must not silently share one arbitrary timeout.
        "registry_projection_ttl_hours": 168,
        "registry_health_ttl_hours": 24,
        "registry_freshness_ttl_hours": profile.freshness_ttl_hours,
        "web_catalog_allowed": bool(profile.web_catalog_allowed),
        "source_attribution_required": bool(profile.source_attribution_required),
        "google_jobs_distribution_allowed": bool(profile.google_jobs_distribution_allowed),
        "third_party_job_distribution_allowed": bool(profile.third_party_job_distribution_allowed),
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {**payload, "registry_policy_hash": hashlib.sha256(encoded).hexdigest()}


def registry_snapshot() -> dict:
    validation = validate_registry()
    certificates = [certification(profile) for profile in PROFILES.values()]
    for item in certificates:
        profile = PROFILES[item["canonical_source"]]
        aliases, patterns = _claims(profile)
        item["emitted_aliases"] = sorted(aliases)
        item["emitted_patterns"] = [pattern.pattern for pattern in patterns]
        item["contract_covered"] = bool(profile.source_family and profile.semantic_version and profile.opportunity_kinds or profile.adapter is None)
        item["freshness_ttl_hours"] = profile.freshness_ttl_hours
        item["active"] = profile.active
        entrypoints = executable_producers().get(profile.source, ())
        item["producer_execution"] = {"state": "EXECUTABLE_PRODUCER" if entrypoints else "NO_EXECUTABLE_PRODUCER",
            "entrypoints": list(entrypoints), "operational_default": "ACTIVE" if entrypoints else "INACTIVE"}
        if not entrypoints:
            root = Path(__file__).resolve().parents[1]
            # A versioned workflow profile may name a real script whose emitted
            # identity belongs to another canonical producer. Diagnose that
            # distinction instead of claiming that the script itself is absent.
            declared = {path for run_id, path in re.findall(r"run_scraper_monitored\.py\s+(\S+)\s+\S+\s+(scrapers/[^\s]+\.py)",
                (root / ".github/workflows/scrapers.yml").read_text(encoding="utf-8"))
                if re.sub(r"(?:_scraper|_scrapper)$", "", run_id) == profile.source}
            owners = sorted(source for source, paths in executable_producers().items() if declared.intersection(paths))
            item["producer_execution"].update({"reason": "ENTRYPOINT_IDENTITY_BELONGS_TO_ANOTHER_PROFILE" if owners else "NO_IMPLEMENTED_MAIN_ENTRYPOINT",
                "canonical_producer_owners": owners})
        item["refresh_capability"] = {
            "scout": profile.scout,
            "discovery_strategy": profile.discovery_strategy,
            "detail_strategy": profile.detail_strategy,
            "adapter": profile.adapter,
            "cleaner": profile.cleaner,
        }
        # Snapshot consumers receive the same evidence as core certification,
        # under an explicit public name rather than a second copy.
        item["certification_evidence"] = item.pop("evidence")
        item["distribution_policy"] = {"web_catalog_allowed": profile.web_catalog_allowed, "search_engine_indexing_allowed": profile.search_engine_indexing_allowed, "source_attribution_required": profile.source_attribution_required, "third_party_job_distribution_allowed": profile.third_party_job_distribution_allowed, "google_jobs_distribution_allowed": profile.google_jobs_distribution_allowed}
        item["blocking_requirements"] = item.pop("missing")
    snapshot = {"schema_version": "source-intelligence-registry:v2", "profiles": len(PROFILES), "emitted_aliases": len(validation["aliases"]), "alias_collisions": validation["alias_collisions"], "ambiguous_patterns": validation["ambiguous_patterns"], "alias_pattern_conflicts": validation["alias_pattern_conflicts"], "certified": sum(item["certified"] for item in certificates), "auto_enabled": sum(item["auto_enabled"] for item in certificates), "pending_certification": sum(not item["certified"] for item in certificates), "sources": certificates}
    # The hash is a deterministic freshness marker for generated consumers.
    snapshot["registry_hash"] = hashlib.sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return snapshot

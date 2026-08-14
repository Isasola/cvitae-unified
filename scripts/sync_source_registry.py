"""
Sincroniza scrapers/source_registry.json con la tabla opportunity_sources en Supabase.

Para cada fuente en el registry que no tenga fila en opportunity_sources:
  - Crea la fila con trust_level según el tier (A→review, B→review, C→blocked)
  - allowed_opportunity_types desde opportunity_scopes
  - eligible_countries/regions desde el registry
  - Todos los flags de activación en false (política de seguridad)

Para fuentes que ya existen: no sobreescribe nada — preserva configuración manual.

Uso:
  python scripts/sync_source_registry.py              # preview (no escribe)
  python scripts/sync_source_registry.py --apply       # inserta filas faltantes
  python scripts/sync_source_registry.py --apply --source mef_inapp_becas
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "scrapers" / "source_registry.json"

# Mapeo tier → trust_level
TIER_TRUST = {"A": "review", "B": "review", "C": "blocked"}

# Los únicos status que merecen una fila en opportunity_sources
ACTIVE_STATUSES = {"candidate", "research_verified", "active", "paused"}


def build_row(entry: dict) -> dict:
    """Construye el dict para insertar en opportunity_sources."""
    tier = str(entry.get("source_tier") or "B").upper()
    scopes = entry.get("opportunity_scopes") or []
    eligible_regions = []
    market = str(entry.get("market") or "").upper()
    if market in ("PY", "LATAM", "AMERICAS"):
        eligible_regions = ["LATAM"]
    elif market == "GLOBAL":
        eligible_regions = ["GLOBAL"]

    return {
        "source": entry["source_id"],
        "display_name": entry.get("name") or entry["source_id"].replace("_", " ").title(),
        "country_code": "PY" if market == "PY" else None,
        "trust_level": TIER_TRUST.get(tier, "review"),
        "auto_verify": False,
        "is_enabled": False,
        "verification_criteria": {
            "tier": tier,
            "original_source_required": entry.get("original_source_required", True),
            "access_note": entry.get("access_note") or "",
        },
        "catalog_enabled": False,
        "matching_enabled": False,
        "alerts_enabled": False,
        "seo_enabled": False,
        "allowed_opportunity_types": scopes,
        "max_items_per_day": 100,
        "retention_days": 90,
        "notes": f"Tier {tier} — sincronizado desde source_registry.json",
    }


def fetch_existing_sources(supabase_url: str, service_key: str) -> set[str]:
    hdrs = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    resp = requests.get(
        f"{supabase_url}/rest/v1/opportunity_sources",
        params={"select": "source"},
        headers=hdrs,
        timeout=15,
    )
    resp.raise_for_status()
    return {row["source"] for row in resp.json()}


def insert_source(supabase_url: str, service_key: str, row: dict) -> bool:
    hdrs = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    resp = requests.post(
        f"{supabase_url}/rest/v1/opportunity_sources",
        json=row,
        headers=hdrs,
        timeout=15,
    )
    if resp.status_code in (200, 201):
        return True
    print(f"  ERROR insertando {row['source']}: {resp.status_code} {resp.text[:120]}", file=sys.stderr)
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Insertar filas en Supabase")
    parser.add_argument("--source", help="Procesar solo esta fuente del registry")
    args = parser.parse_args()

    # Cargar .env
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                if k.strip() and k.strip() not in os.environ:
                    os.environ[k.strip()] = v.strip()

    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not service_key:
        print("ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos.", file=sys.stderr)
        sys.exit(1)

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = registry.get("sources") or registry  # soporta ambos formatos
    if isinstance(entries, dict):
        entries = list(entries.values())

    # Filtrar por --source si se especificó
    if args.source:
        entries = [e for e in entries if e.get("source_id") == args.source]
        if not entries:
            print(f"ERROR: fuente '{args.source}' no encontrada en el registry.")
            sys.exit(1)

    # Solo procesar fuentes en estados relevantes
    to_process = [e for e in entries if e.get("status") in ACTIVE_STATUSES]
    print(f"Registry: {len(entries)} fuentes totales, {len(to_process)} en estado procesable")

    # Obtener cuáles ya existen
    existing = fetch_existing_sources(supabase_url, service_key)
    print(f"Supabase: {len(existing)} fuentes ya registradas")

    to_insert = [e for e in to_process if e.get("source_id") not in existing]
    already_present = [e for e in to_process if e.get("source_id") in existing]

    print(f"\n--- Fuentes ya presentes ({len(already_present)}) ---")
    for e in already_present:
        print(f"  OK {e['source_id']} (Tier {e.get('source_tier')}, status={e.get('status')})")

    print(f"\n--- Fuentes a insertar ({len(to_insert)}) ---")
    rows = []
    for e in to_insert:
        row = build_row(e)
        rows.append(row)
        print(f"  + {row['source']:<30} trust={row['trust_level']:<8} tier={e.get('source_tier')}")  # noqa: E501
        if row.get("allowed_opportunity_types"):
            print(f"    types: {', '.join(row['allowed_opportunity_types'])}")

    if not to_insert:
        print("\nNada nuevo que insertar.")
        return

    if args.apply:
        inserted = 0
        for row in rows:
            if insert_source(supabase_url, service_key, row):
                inserted += 1
                print(f"  Insertado: {row['source']}")
        print(f"\n{inserted}/{len(rows)} fuentes insertadas en opportunity_sources")
    else:
        print("\n(Modo preview — usar --apply para insertar en Supabase)")


if __name__ == "__main__":
    main()

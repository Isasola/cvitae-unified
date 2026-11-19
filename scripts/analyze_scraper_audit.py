"""Classify dry-run scraper evidence into actionable quality groups."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "tmp" / "scraper-audit"
GENERIC = re.compile(
    r"^(trabaj[áa] con nosotros|trabaja con nosotros|empleos? en |vacantes abiertas en |"
    r"ver empleos en |login$|concursos?$|no results|fran[cç]ais$|multitrabajos$)", re.I
)
MANUAL_NEEDS_REPAIR = {
    "automotriz_scraper", "bancos_scraper", "becal_scraper", "callcenters_scraper",
    "foros_scraper", "fundacion_scraper", "gastronomia_hoteles_scraper",
    "logistica_transporte_scraper", "medios_comunicacion_scraper", "ongs_scraper",
    "seguros_scraper", "talentcom_scraper",
}


def folded(value: object) -> str:
    return unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii").casefold()


def opportunity_kind(item: dict) -> str:
    stored = folded(item.get("opportunity_kind"))
    value = folded(item.get("type")) if stored in ("", "empleo") else stored
    for terms, result in (
        (("beca", "scholarship", "fellowship", "bursary"), "beca"), (("pasant", "internship"), "pasantia"),
        (("concurso", "competition"), "concurso"), (("voluntar", "volunteer"), "voluntariado"),
        (("curso", "course", "training"), "curso"), (("intercambio", "exchange"), "intercambio"),
        (("conferencia", "conference", "summit"), "conferencia"),
        (("program", "capital semilla", "grant", "funding", "oportunidad"), "programa"),
    ):
        if any(term in value for term in terms): return result
    return "empleo"


def beta_eligible(item: dict) -> bool:
    if opportunity_kind(item) != "empleo":
        return True
    country = folded(item.get("country_code"))
    location = folded(item.get("location"))
    if country == "py" or any(term in location for term in ("paraguay", "asuncion", "san lorenzo", "luque", "ciudad del este", "encarnacion")):
        return True
    text = " ".join(folded(item.get(key)) for key in ("title", "location", "description", "compatibility"))
    restricted = ("us only", "united states only", "usa only", "canada only", "europe only", "uk only")
    accessible = ("worldwide", "anywhere", "latin america", "latam", "global remote", "remote globally")
    return any(term in text for term in accessible) and not any(term in text for term in restricted)


def main() -> None:
    report = json.loads((AUDIT / "report.json").read_text(encoding="utf-8"))
    all_urls: Counter[str] = Counter()
    classified = []
    global_types: Counter[str] = Counter()
    global_kinds: Counter[str] = Counter()
    eligible_by_source: Counter[str] = Counter()
    for row in report["results"]:
        sample = row.get("sample") or []
        generic = sum(bool(GENERIC.search(str(item.get("title") or "").strip())) for item in sample)
        missing_org = sum(not str(item.get("organization") or "").strip() for item in sample)
        missing_location = sum(not str(item.get("location") or "").strip() for item in sample)
        missing_type = sum(not str(item.get("type") or "").strip() for item in sample)
        bad_url = sum(not str(item.get("application_url") or "").startswith(("https://", "http://")) for item in sample)
        for item in sample:
            url = str(item.get("application_url") or "").strip()
            if url:
                all_urls[url] += 1
            global_types[str(item.get("type") or "sin_tipo").strip().lower()] += 1
            global_kinds[opportunity_kind(item)] += 1
            if beta_eligible(item): eligible_by_source[row["scraper"]] += 1
        if row["status"] != "completed":
            decision = "broken"
        elif row["unique"] == 0:
            decision = "empty"
        elif row["scraper"] in MANUAL_NEEDS_REPAIR:
            decision = "needs_repair"
        elif sample and generic / len(sample) >= 0.5:
            decision = "directory_only"
        elif bad_url or (sample and missing_type / len(sample) >= 0.5):
            decision = "needs_repair"
        else:
            decision = "candidate"
        classified.append({
            "scraper": row["scraper"], "decision": decision, "unique": row["unique"],
            "sample_count": len(sample), "generic_titles": generic, "missing_organization": missing_org,
            "missing_location": missing_location, "missing_type": missing_type, "bad_url": bad_url,
        })
    duplicates = {url: count for url, count in all_urls.items() if count > 1}
    summary = {
        "sources": dict(Counter(row["decision"] for row in classified)),
        "potential_unique_before_cross_source_dedupe": sum(row["unique"] for row in report["results"]),
        "sample_records_checked": sum(row["sample_count"] for row in classified),
        "sample_type_distribution": dict(global_types.most_common()),
        "opportunity_kind_distribution": dict(global_kinds.most_common()),
        "conservative_beta_eligible": sum(eligible_by_source.values()),
        "beta_eligible_by_source": dict(eligible_by_source.most_common()),
        "cross_source_duplicate_urls_in_sample": len(duplicates),
        "results": classified,
    }
    (AUDIT / "quality-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# Auditoría de scrapers CVitae", "", f"- Fuentes auditadas: {len(classified)}", f"- Potenciales únicas: {summary['potential_unique_before_cross_source_dedupe']}", f"- Registros de muestra inspeccionados: {summary['sample_records_checked']}", ""]
    for decision in ("candidate", "directory_only", "needs_repair", "empty", "broken"):
        rows = [row for row in classified if row["decision"] == decision]
        lines += [f"## {decision} ({len(rows)})", "", *[f"- {row['scraper']}: {row['unique']} únicas; genéricas {row['generic_titles']}/{row['sample_count']}" for row in rows], ""]
    (AUDIT / "quality-summary.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({key: value for key, value in summary.items() if key != "results"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

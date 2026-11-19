"""Generate a review-only SQL migration from the latest full dry-run audit."""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "tmp" / "scraper-audit"
sys.path.insert(0, str(ROOT / "scripts"))
from analyze_scraper_audit import beta_eligible, opportunity_kind  # noqa: E402


def repair_text(value):
    if not isinstance(value, str):
        return value
    current = value
    for _ in range(2):
        if not any(marker in current for marker in ("Ã", "Â", "â", "ð")):
            break
        try:
            repaired = current.encode("latin1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            break
        if repaired.count("Ã") + repaired.count("Â") < current.count("Ã") + current.count("Â"):
            current = repaired
        else:
            break
    return current


def expired(value) -> bool:
    if not value:
        return False
    text = str(value).strip()[:10]
    try:
        return datetime.strptime(text, "%Y-%m-%d").date() < date.today()
    except ValueError:
        return False


def main() -> None:
    report = json.loads((AUDIT / "report.json").read_text(encoding="utf-8"))
    rows = []
    seen = set()
    allowed = {"title", "slug", "organization", "location", "continent", "type", "rubro", "value", "deadline", "tags", "description", "application_url", "source", "country_code", "department", "city"}
    for result in report["results"]:
        for raw in result.get("sample") or []:
            if not beta_eligible(raw) or expired(raw.get("deadline")):
                continue
            url = str(raw.get("application_url") or "").strip()
            if not url or url in seen:
                continue
            seen.add(url)
            item = {key: raw.get(key) for key in allowed if raw.get(key) is not None}
            item = {key: repair_text(value) if isinstance(value, str) else [repair_text(part) for part in value] if isinstance(value, list) else value for key, value in item.items()}
            item.update({
                "opportunity_kind": opportunity_kind(raw), "verification_status": "in_review",
                "is_active": False, "catalog_eligible": False, "match_eligible": False,
                "alerts_eligible": False, "seo_eligible": False,
                "verification_reasons": ["Importada desde auditoría aislada; requiere aprobación humana"],
            })
            rows.append(item)
    payload = json.dumps(rows, ensure_ascii=False).replace("$cvitae$", "")
    sql = f"""-- Generated from tmp/scraper-audit/report.json. All rows remain private and review-only.
with incoming as (
  select * from jsonb_to_recordset($cvitae${payload}$cvitae$::jsonb) as x(
    title text, slug text, organization text, location text, continent text, type text,
    opportunity_kind text, rubro text, value text, deadline timestamptz,
    tags text[], description text, application_url text, source text, country_code text,
    department text, city text, verification_status text, is_active boolean,
    catalog_eligible boolean, match_eligible boolean, alerts_eligible boolean, seo_eligible boolean,
    verification_reasons jsonb
  )
)
insert into public.opportunities (
  title, slug, organization, location, continent, type, opportunity_kind, rubro, value,
  deadline, tags, description, application_url, source, country_code,
  department, city, verification_status, is_active, catalog_eligible, match_eligible,
  alerts_eligible, seo_eligible, verification_reasons
)
select title, slug, organization, location, continent, type, opportunity_kind, rubro, value,
  deadline, tags, description, application_url, source, country_code,
  department, city, verification_status, is_active, catalog_eligible, match_eligible,
  alerts_eligible, seo_eligible, verification_reasons
from incoming
on conflict (application_url) do update set
  title = excluded.title, organization = excluded.organization, location = excluded.location,
  type = excluded.type, opportunity_kind = excluded.opportunity_kind, rubro = excluded.rubro,
  value = excluded.value, deadline = excluded.deadline,
  tags = excluded.tags, description = excluded.description, country_code = excluded.country_code,
  department = excluded.department, city = excluded.city, updated_at = now()
where opportunities.verification_status <> 'verified';

do $$
declare counts jsonb; kinds jsonb;
begin
  select jsonb_object_agg(verification_status, amount) into counts
  from (select verification_status, count(*) amount from public.opportunities group by verification_status) grouped;
  select jsonb_object_agg(opportunity_kind, amount) into kinds
  from (select opportunity_kind, count(*) amount from public.opportunities group by opportunity_kind) grouped;
  raise notice 'CVITAE_BETA_COUNTS statuses=% kinds=%', counts, kinds;
end $$;
"""
    target = ROOT / "supabase" / "migrations" / "202608110013_stage_beta_opportunities.sql"
    target.write_text(sql, encoding="utf-8")
    print(json.dumps({"prepared": len(rows), "migration": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

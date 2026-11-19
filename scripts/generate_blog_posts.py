#!/usr/bin/env python3
"""Create review-only blog drafts from current, explicitly eligible records."""

import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timezone

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.6-flash")
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def _safe_http_error(response):
    body = " ".join((response.text or "").split())[:800]
    return f"HTTP {response.status_code} {body}".strip()


def sb_get(table, params=None, range_start=None, range_end=None):
    headers = HEADERS.copy()
    if range_start is not None and range_end is not None:
        headers.update({"Range-Unit": "items", "Range": f"{range_start}-{range_end}"})
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=headers,
        params=params or {},
        timeout=20,
    )
    if not response.ok:
        raise requests.HTTPError(_safe_http_error(response), response=response)
    data = response.json()
    if not isinstance(data, list):
        raise ValueError(f"Unexpected response shape for {table}")
    return data


def sb_get_all(table, params=None, page_size=1000):
    rows = []
    for start in range(0, 10_000_000, page_size):
        page = sb_get(table, params, start, start + page_size - 1)
        rows.extend(page)
        if len(page) < page_size:
            return rows
    raise RuntimeError(f"PAGINATION_BUDGET_EXHAUSTED:{table}")


def sb_post(table, data):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=HEADERS,
        json=data,
        timeout=20,
    )
    if not response.ok:
        raise requests.HTTPError(_safe_http_error(response), response=response)


def _explicitly_py_eligible(row):
    country = str(row.get("country_code") or "").strip().upper()
    eligible = row.get("eligible_countries") or []
    if isinstance(eligible, str):
        eligible = [eligible]
    eligible = {str(value).strip().upper() for value in eligible}
    return country == "PY" or bool({"PY", "PARAGUAY"} & eligible)


def _not_expired(row, today=None):
    raw = str(row.get("deadline") or "").strip()
    if not raw:
        return True  # verified + active is the current-state authority
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            expires = date.fromisoformat(raw)
        else:
            normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
            expires = datetime.fromisoformat(normalized).date()
    except (TypeError, ValueError):
        return False
    return expires >= (today or datetime.now(timezone.utc).date())


def _postgrest_in(values):
    # Quote each value so punctuation in a canonical source cannot change the
    # PostgREST filter expression.
    escaped = [str(value).replace("\\", "\\\\").replace('"', '\\"') for value in values]
    return "(" + ",".join(f'"{value}"' for value in escaped) + ")"


def get_ss_opportunities(_legacy_policy=None):
    """Use the effective Catalog and SEO views as consumer and editorial gates."""
    columns = "id,title,organization,opportunity_type,opportunity_kind,deadline,source,location,country_code,eligible_countries,application_url,source_url,created_at,updated_at"
    params = {"select": columns, "order": "id.asc"}
    catalog = sb_get_all("opportunity_catalog_universe", params)
    seo = sb_get_all("opportunity_seo_universe", params)
    seo_ids = {str(row.get("id")) for row in seo if row.get("id")}
    opportunities = [row for row in catalog if row.get("id") and str(row["id"]) in seo_ids]
    return [
        row for row in opportunities
        if row.get("id") and row.get("title") and _has_original_url(row)
        and _explicitly_py_eligible(row) and _not_expired(row)
    ]


def _has_original_url(row):
    from urllib.parse import urlparse
    value = str(row.get("application_url") or row.get("source_url") or "").strip()
    parsed = urlparse(value)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def group_by_theme(opportunities):
    scholarships = [row for row in opportunities if row.get("opportunity_type") in ("scholarship", "fellowship") or row.get("opportunity_kind") == "beca"]
    programs = [row for row in opportunities if row.get("opportunity_type") in ("grant", "exchange_program", "training", "accelerator")]
    groups = []
    if len(scholarships) >= 2:
        groups.append(("becas", scholarships[:5]))
    if len(programs) >= 2:
        groups.append(("programas", programs[:5]))
    if not groups and len(opportunities) >= 2:
        groups.append(("oportunidades", opportunities[:5]))
    return groups


def topic_fingerprint(theme, opportunities):
    ids = sorted({str(row["id"]) for row in opportunities if row.get("id")})
    digest = hashlib.sha256((theme + "\n" + "\n".join(ids)).encode("utf-8")).hexdigest()
    return digest, ids


def draft_exists(fingerprint):
    existing = sb_get("content_hub", {
        "select": "id",
        "tipo": "eq.blog",
        "is_active": "eq.false",
        "metadata->>topic_fingerprint": f"eq.{fingerprint}",
        "limit": "1",
    })
    return bool(existing)


def call_gemini(prompt):
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY_REQUIRED_FOR_REVIEW_DRAFT")
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096},
    }
    models = list(dict.fromkeys([GEMINI_MODEL, GEMINI_FALLBACK_MODEL]))
    for index, model in enumerate(models):
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": GEMINI_API_KEY},
            json=payload,
            timeout=60,
        )
        if response.status_code in (400, 404) and index + 1 < len(models):
            body = (response.text or "").casefold()
            unavailable_model = "model" in body and any(term in body for term in ("not found", "unsupported", "not available"))
            if unavailable_model:
                continue
        if not response.ok:
            raise requests.HTTPError(_safe_http_error(response), response=response)
        candidates = response.json().get("candidates") or []
        parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
        text = "".join(str(part.get("text", "")) for part in parts if part.get("text"))
        if not text.strip():
            raise ValueError("Gemini returned no text candidate")
        return text
    raise RuntimeError("No configured Gemini model is available")


PROMPT_TEMPLATE = """Escribí un borrador breve en español rioplatense sobre estas {theme} verificadas y activas para Paraguay.

DATOS FUENTE:
{opp_list}

REGLAS:
- No inventes requisitos, salarios, ubicaciones, fechas, cupos ni elegibilidad.
- No atribuyas a CVitae hechos que no figuren arriba.
- Por cada ficha, resumí solo el título y empleador. Para detalles remití al enlace original.
- Si un dato no aparece, decí que no está informado y orientá a verificarlo en la fuente.
- Usá un título y texto útil, directo y sin estadísticas no verificadas.
- No agregues FAQ.

Respondé exclusivamente con JSON válido: {{"titulo":"...","slug":"...","cuerpo":"..."}}"""


def generate_article(theme, opportunities):
    opp_list = "\n".join(
        f"- ID: {row['id']} | {row['title']} | empleador: {row.get('organization') or 'no informado'} | "
        f"ubicación: {row.get('location') or 'no informada'} | cierre: {row.get('deadline') or 'sin fecha informada'} | "
        f"fuente: {row['source']} | URL original: {row.get('application_url') or row.get('source_url')}"
        for row in opportunities
    )
    raw = call_gemini(PROMPT_TEMPLATE.format(theme=theme, opp_list=opp_list))
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())
    article = json.loads(raw)
    if not isinstance(article, dict) or not str(article.get("titulo", "")).strip() or not str(article.get("cuerpo", "")).strip():
        raise ValueError("Generated article is missing title/body")
    return article


def save_draft(article, trigger_source, theme, opportunities, fingerprint, ids):
    slug_base = re.sub(r"[^a-z0-9]+", "-", str(article.get("slug") or article["titulo"]).lower()).strip("-")
    slug = f"{slug_base[:60]}-{fingerprint[:8]}"
    source_links = [
        f"- [{row['title']}]({row.get('application_url') or row.get('source_url')}) — {row.get('organization') or 'empleador no informado'}"
        for row in opportunities
    ]
    body = str(article["cuerpo"]).strip() + "\n\n## Fuentes originales\n\n" + "\n".join(source_links)
    row = {
        "tipo": "blog",
        "titulo": str(article["titulo"])[:200],
        "slug": slug,
        "cuerpo": body,
        "categoria": "Becas" if theme == "becas" else "Oportunidades",
        "ubicacion": "Paraguay",
        "is_active": False,
        "metadata": {
            "auto_generated": True,
            "needs_review": True,
            "approval": {
                "kind": "BLOG",
                "status": "PENDING_REVIEW",
                "audit": [{"action": "CREATE", "actor": "blog_generator", "at": datetime.now(timezone.utc).isoformat()}],
            },
            "trigger_source": trigger_source,
            "tier": "SS",
            "topic_fingerprint": fingerprint,
            "topic": theme,
            "source_opportunity_ids": ids,
            "source_urls": [row.get("application_url") or row.get("source_url") for row in opportunities],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    sb_post("content_hub", row)
    print(f"  Draft saved for review: {row['titulo'][:70]}")


def main():
    print(f"[blog-generator] {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    outcomes = {"CREATED": 0, "SKIPPED_LEGITIMATE": 0, "NO_ELIGIBLE_ROWS": 0, "FAILED": 0}
    try:
        opportunities = get_ss_opportunities()
    except Exception as exc:
        outcomes["FAILED"] += 1
        print(f"SUMMARY FAILED source_read: {type(exc).__name__}: {exc}")
        print("SUMMARY " + json.dumps(outcomes, sort_keys=True))
        return 1
    print(f"Found {len(opportunities)} current eligible records from Catalog ∩ SEO effective universes")
    groups = group_by_theme(opportunities)
    if not groups:
        if not opportunities:
            outcomes["NO_ELIGIBLE_ROWS"] += 1
            print("::warning title=Blog generator NO_ELIGIBLE_ROWS::No current original-linked opportunities have explicit Paraguay eligibility.")
            print("SUMMARY NO_ELIGIBLE_ROWS: no currently admitted, original-linked, explicitly PY-eligible rows")
            print("SUMMARY " + json.dumps(outcomes, sort_keys=True))
            return 0
        outcomes["SKIPPED_LEGITIMATE"] += 1
        print("::notice title=Blog generator SKIPPED_LEGITIMATE::Fewer than two eligible rows for a source-backed topic.")
        print("SUMMARY SKIPPED_LEGITIMATE: fewer than two eligible rows for an evidence-based theme")
        print("SUMMARY " + json.dumps(outcomes, sort_keys=True))
        return 0

    for theme, theme_opportunities in groups:
        fingerprint, ids = topic_fingerprint(theme, theme_opportunities)
        try:
            if draft_exists(fingerprint):
                outcomes["SKIPPED_LEGITIMATE"] += 1
                print(f"::notice title=Blog generator SKIPPED_LEGITIMATE::{theme} and its source IDs already have a review draft.")
                print(f"SUMMARY SKIPPED_LEGITIMATE {theme}: this topic and ID set already has a draft")
                continue
            article = generate_article(theme, theme_opportunities)
            save_draft(article, theme_opportunities[0]["source"], theme, theme_opportunities, fingerprint, ids)
            outcomes["CREATED"] += 1
            print(f"::notice title=Blog generator CREATED::{theme} draft is pending editorial review.")
            print(f"SUMMARY CREATED {theme}: fingerprint={fingerprint[:12]} editorial_status=PENDING_REVIEW")
        except Exception as exc:
            outcomes["FAILED"] += 1
            print(f"::error title=Blog generator FAILED::{theme} draft creation failed: {type(exc).__name__}")
            print(f"SUMMARY FAILED {theme}: {type(exc).__name__}: {exc}")

    print("SUMMARY " + json.dumps(outcomes, sort_keys=True))
    return 1 if outcomes["FAILED"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

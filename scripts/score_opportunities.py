"""
Calcula verification_score y verification_reasons para oportunidades en in_review.

Dimensiones (total 100 pt):
  - http_valid        25 pt: URL responde 200–399, no es login/signin/privacy/terms
  - domain_coherent   15 pt: dominio de application_url es coherente con organization
  - deadline_valid    15 pt: deadline presente y en el futuro
  - fields_complete   15 pt: title, organization, location, type, application_url presentes
  - latam_eligible    15 pt: elegibilidad Paraguay/LatAm demostrable
  - content_real      10 pt: sin señales de resultado/noticia/cierre
  - not_duplicate      5 pt: no es fuzzy-duplicado por título+organización

Uso:
  python scripts/score_opportunities.py                  # preview, sin escritura
  python scripts/score_opportunities.py --apply          # actualiza Supabase local
  python scripts/score_opportunities.py --apply --source opportunitydesk
  python scripts/score_opportunities.py --apply --limit 50
  python scripts/score_opportunities.py --apply --id <opportunity_id>

Variables de entorno requeridas para --apply:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (del archivo .env del proyecto)
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import sys
import time
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
HEADERS = {"User-Agent": "CVitaeQualityAudit/1.0 (+https://cvitae.lat)"}

# ── Señales negativas en el HTML de la página ──────────────────────────────
CLOSED_PAGE = re.compile(
    r"(position has been filled|job (?:is )?closed|vacancy closed|"
    r"application period (?:has )?ended|convocatoria cerrada|ya no est[aá] disponible|"
    r"404 not found|felicitamos a los? ganadores?|resultado(?:s)? de la convocatoria|"
    r"acta de adjudicaci[oó]n|ganadores? del concurso|cerrada el \d|"
    r"lamentamos informar|la convocatoria ha concluido)",
    re.I,
)
BAD_PATH = re.compile(r"/(login|signin|sign-in|privacy|terms|cookies|about)/?$", re.I)

# ── Señales de elegibilidad LatAm/PY ──────────────────────────────────────
LATAM_SIGNALS = re.compile(
    r"(paraguay|latinoam[eé]rica|am[eé]rica latina|latam|"
    r"centroam[eé]rica|sudamer|worldwide|todo el mundo|global|"
    r"open to all|cualquier pa[ií]s|international)",
    re.I,
)
EXCLUDE_LATAM = re.compile(
    r"\b(us only|united states only|usa only|canada only|"
    r"europe only|uk only|european union only|eu only)\b",
    re.I,
)
PY_COUNTRY = re.compile(r"\bpy\b", re.I)

# ── Normalización de texto para comparación fuzzy ─────────────────────────
def _fold(value: object) -> str:
    s = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().casefold()
    return re.sub(r"[^a-z0-9 ]", " ", s).strip()


def _similarity(a: str, b: str) -> float:
    """Trigram similarity — 0.0 a 1.0."""
    def trigrams(s: str) -> set[str]:
        padded = "  " + s + "  "
        return {padded[i:i+3] for i in range(len(padded) - 2)}
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ── Scoring por dimensión ──────────────────────────────────────────────────

def _score_http(url: str, timeout: int) -> tuple[int, str]:
    """25 pt: URL responde 200–399, destino no es página de login/privacidad."""
    if not url or not url.startswith(("http://", "https://")):
        return 0, "URL ausente o inválida"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True, stream=True)
        sample = b""
        for chunk in resp.iter_content(8192):
            sample += chunk
            if len(sample) >= 80_000:
                break
        text = sample.decode(resp.encoding or "utf-8", errors="ignore")
        final = resp.url
        if resp.status_code in (401, 403, 429):
            return 15, f"Fuente bloquea auditoría automática ({resp.status_code}) — requiere revisión"
        if not (200 <= resp.status_code < 400):
            return 0, f"HTTP {resp.status_code}"
        if BAD_PATH.search(urlparse(final).path):
            return 0, "Redirigido a login/privacidad/términos"
        if CLOSED_PAGE.search(text):
            return 0, "Página indica cierre o resultado de convocatoria"
        return 25, "URL accesible"
    except requests.exceptions.Timeout:
        return 10, "Timeout — no se pudo verificar"
    except requests.RequestException as exc:
        return 0, f"Error de red: {type(exc).__name__}"


def _score_domain(url: str, organization: str) -> tuple[int, str]:
    """15 pt: dominio coherente con organización."""
    if not url or not organization:
        return 5, "Sin URL u organización para comparar"
    org_fold = _fold(organization)
    domain = urlparse(url).netloc.lower().replace("www.", "")
    domain_fold = _fold(domain)
    # Comparar palabras clave de la organización con el dominio
    org_words = [w for w in org_fold.split() if len(w) >= 4]
    if any(w in domain_fold for w in org_words):
        return 15, "Dominio coherente con organización"
    # Intentar trigram similarity entre org y dominio
    sim = _similarity(org_fold, domain_fold)
    if sim >= 0.25:
        return 10, f"Dominio parcialmente relacionado (sim={sim:.2f})"
    # Dominios conocidos de agregadores legítimos
    aggregators = ("linkedin.com", "indeed.com", "glassdoor.com", "computrabajo.com",
                   "opportunitydesk.org", "remotive.com", "weworkremotely.com",
                   "arbeitnow.com", "oyaop.com", "jobicy.com", "himalayas.app",
                   "unjobs.org", "fundacioncarolina.es")
    if any(agg in domain for agg in aggregators):
        return 8, "Dominio es agregador conocido — verificar fuente original"
    return 5, f"Dominio no relacionado con organización (sim={sim:.2f})"


def _score_deadline(deadline_str: str | None) -> tuple[int, str]:
    """15 pt: deadline presente y en el futuro."""
    if not deadline_str:
        return 5, "Sin fecha de cierre — expiración incierta"
    try:
        # Parsear ISO 8601
        dl = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))
        if dl.tzinfo is None:
            dl = dl.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        days_left = (dl - now).days
        if days_left < 0:
            return 0, f"Deadline vencida hace {-days_left} días"
        if days_left < 7:
            return 8, f"Deadline en {days_left} días — vence pronto"
        return 15, f"Deadline válida: {days_left} días restantes"
    except (ValueError, TypeError):
        return 5, f"Fecha no parseable: {deadline_str!r}"


def _score_fields(opp: dict) -> tuple[int, str]:
    """15 pt: completitud de campos esenciales."""
    required = ["title", "organization", "location", "application_url"]
    optional = ["description", "type", "opportunity_type"]
    missing_req = [f for f in required if not str(opp.get(f) or "").strip()]
    missing_opt = [f for f in optional if not str(opp.get(f) or "").strip()]
    if missing_req:
        return max(0, 15 - len(missing_req) * 5), f"Campos faltantes: {', '.join(missing_req)}"
    if missing_opt:
        return 10, f"Campos opcionales ausentes: {', '.join(missing_opt)}"
    return 15, "Todos los campos esenciales presentes"


def _score_latam(opp: dict) -> tuple[int, str]:
    """15 pt: elegibilidad Paraguay/LatAm."""
    country = str(opp.get("country_code") or "").strip().lower()
    if country == "py":
        return 15, "País: Paraguay"
    eligible_countries = opp.get("eligible_countries") or []
    eligible_regions = opp.get("eligible_regions") or []
    if "PY" in eligible_countries or "py" in eligible_countries:
        return 15, "eligible_countries incluye Paraguay"
    latam_regions = ("latam", "latin_america", "latin america", "south_america", "global", "worldwide")
    if any(r.lower() in latam_regions for r in eligible_regions):
        return 15, f"eligible_regions incluye LatAm/global: {', '.join(eligible_regions)}"
    # Buscar señales en texto libre
    text = " ".join(str(opp.get(k) or "") for k in ("title", "description", "location", "compatibility"))
    if EXCLUDE_LATAM.search(text):
        return 0, "Excluye explícitamente LatAm/Paraguay"
    if PY_COUNTRY.search(text) or LATAM_SIGNALS.search(text):
        return 10, "Señales de elegibilidad LatAm en texto libre"
    location = str(opp.get("location") or "").lower()
    if any(city in location for city in ("asuncion", "asunción", "paraguay")):
        return 15, "Ubicación: Paraguay"
    return 3, "Sin señales claras de elegibilidad PY/LatAm"


def _score_content(opp: dict) -> tuple[int, str]:
    """10 pt: sin señales de resultado/noticia/cierre en el título/descripción."""
    title = str(opp.get("title") or "")
    desc = str(opp.get("description") or "")[:500]
    text = title + " " + desc
    if CLOSED_PAGE.search(text):
        return 0, "Título o descripción indica cierre o resultado"
    # Patrones de noticias (no convocatoria)
    news_patterns = re.compile(
        r"(anuncia(?:mos)?|press release|nota de prensa|comunicado|nuevo lanzamiento|"
        r"felicita(?:mos)?|entrevista a|cobertura|fue seleccionado|resultados del proceso)",
        re.I,
    )
    if news_patterns.search(text):
        return 3, "Posible noticia en lugar de convocatoria activa"
    return 10, "Sin señales de cierre o resultado"


_seen_lock = __import__("threading").Lock()


def _score_duplicate(opp: dict, seen_keys: dict[str, str]) -> tuple[int, str]:
    """5 pt: no fuzzy-duplicado por título+organización.

    Lock cubre check+insert completo para evitar que dos workers acepten
    el mismo duplicado (race entre snapshot y escritura).
    Costo: serializa solo la comparación de strings — sin I/O, aceptable.
    """
    title = _fold(opp.get("title") or "")
    org = _fold(opp.get("organization") or "")
    key = f"{title[:60]} | {org[:40]}"
    with _seen_lock:
        for existing_key, existing_id in seen_keys.items():
            sim = _similarity(key, existing_key)
            if sim >= 0.75:
                return 0, f"Posible duplicado de {existing_id} (sim={sim:.2f})"
        seen_keys[key] = str(opp.get("id") or "")
    return 5, "Sin duplicados detectados"


# ── Función principal de scoring ──────────────────────────────────────────

def score_opportunity(opp: dict, seen_keys: dict[str, str], http_timeout: int = 12) -> dict:
    """Devuelve el scoring completo de una oportunidad."""
    url = str(opp.get("application_url") or "").strip()

    http_pts, http_reason = _score_http(url, http_timeout)
    domain_pts, domain_reason = _score_domain(url, str(opp.get("organization") or ""))
    deadline_pts, deadline_reason = _score_deadline(opp.get("deadline"))
    fields_pts, fields_reason = _score_fields(opp)
    latam_pts, latam_reason = _score_latam(opp)
    content_pts, content_reason = _score_content(opp)
    dup_pts, dup_reason = _score_duplicate(opp, seen_keys)

    total = http_pts + domain_pts + deadline_pts + fields_pts + latam_pts + content_pts + dup_pts
    reasons = [
        {"dimension": "http_valid",      "score": http_pts,     "max": 25, "reason": http_reason},
        {"dimension": "domain_coherent", "score": domain_pts,   "max": 15, "reason": domain_reason},
        {"dimension": "deadline_valid",  "score": deadline_pts, "max": 15, "reason": deadline_reason},
        {"dimension": "fields_complete", "score": fields_pts,   "max": 15, "reason": fields_reason},
        {"dimension": "latam_eligible",  "score": latam_pts,    "max": 15, "reason": latam_reason},
        {"dimension": "content_real",    "score": content_pts,  "max": 10, "reason": content_reason},
        {"dimension": "not_duplicate",   "score": dup_pts,      "max":  5, "reason": dup_reason},
    ]
    return {
        "id": opp.get("id"),
        "title": opp.get("title"),
        "source": opp.get("source"),
        "verification_score": total,
        "verification_reasons": reasons,
    }


# ── Obtener oportunidades desde Supabase ──────────────────────────────────

def fetch_opportunities(
    supabase_url: str,
    service_key: str,
    source: str | None = None,
    opp_id: str | None = None,
    limit: int = 500,
) -> list[dict]:
    base = f"{supabase_url}/rest/v1/opportunities"
    params: dict[str, Any] = {
        "select": (
            "id,title,organization,location,type,opportunity_type,application_url,"
            "description,deadline,country_code,eligible_countries,eligible_regions,"
            "source,verification_status,source_authority"
        ),
        "limit": str(limit),
        "order": "created_at.asc",
    }
    if opp_id:
        params["id"] = f"eq.{opp_id}"
    else:
        if source:
            params["source"] = f"eq.{source}"
        # PostgREST IN filter — must be passed as a raw query string param, not via params dict
        # params dict URL-encodes the parens; use raw approach below
    hdrs = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    # Use requests params for most filters, then append PostgREST IN syntax raw
    # because requests URL-encodes parentheses which breaks PostgREST
    prepared = requests.Request("GET", base, params=params).prepare()
    raw_url = prepared.url
    if not opp_id:
        raw_url += "&verification_status=in.(in_review,pending)"
    resp = requests.get(raw_url, headers=hdrs, timeout=30)
    resp.raise_for_status()
    return resp.json()


def apply_scores(
    supabase_url: str,
    service_key: str,
    results: list[dict],
) -> int:
    """Actualiza verification_score y verification_reasons en Supabase. Devuelve filas actualizadas."""
    hdrs = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    updated = 0
    for r in results:
        url = f"{supabase_url}/rest/v1/opportunities?id=eq.{r['id']}"
        body = {
            "verification_score": r["verification_score"],
            "verification_reasons": r["verification_reasons"],
        }
        resp = requests.patch(url, json=body, headers=hdrs, timeout=15)
        if resp.status_code in (200, 204):
            updated += 1
        else:
            print(f"  ERROR actualizando {r['id']}: {resp.status_code} {resp.text[:100]}", file=sys.stderr)
    return updated


# ── CLI ───────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Escribir scores en Supabase")
    parser.add_argument("--source", help="Filtrar por source (ej: opportunitydesk)")
    parser.add_argument("--id", help="Procesar una sola oportunidad por ID")
    parser.add_argument("--limit", type=int, default=500, help="Máximo de oportunidades a procesar")
    parser.add_argument("--workers", type=int, default=6, help="Concurrencia HTTP")
    parser.add_argument("--timeout", type=int, default=12, help="Timeout HTTP en segundos")
    args = parser.parse_args()

    # Cargar variables de entorno
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

    print(f"Obteniendo oportunidades de {supabase_url}...")
    opps = fetch_opportunities(supabase_url, service_key, args.source, args.id, args.limit)
    print(f"  {len(opps)} oportunidades a evaluar")
    if not opps:
        print("Nada que evaluar.")
        return

    seen_keys: dict[str, str] = {}
    results: list[dict] = []

    # Scoring: HTTP en paralelo, resto secuencial por oportunidad
    def score_one(opp: dict) -> dict:
        return score_opportunity(opp, seen_keys, args.timeout)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(score_one, opps):
            results.append(result)

    # Reporte resumen
    scores = [r["verification_score"] for r in results]
    bucket = Counter(
        ">=80" if s >= 80 else "60-79" if s >= 60 else "40-59" if s >= 40 else "<40"
        for s in scores
    )
    by_source: Counter[str] = Counter(r["source"] for r in results)

    print("\n--- Distribucion de scores ---")
    for label in (">=80", "60-79", "40-59", "<40"):
        print(f"  {label:>6}: {bucket[label]:>4} oportunidades")
    print("\n--- Por fuente ---")
    for source, count in by_source.most_common():
        avg = sum(r["verification_score"] for r in results if r["source"] == source) // count
        print(f"  {source:<25} {count:>4} oportunidades  avg_score={avg}")

    # Mostrar muestra de bajo score
    low = sorted((r for r in results if r["verification_score"] < 40), key=lambda r: r["verification_score"])[:5]
    if low:
        print("\n--- Muestra de score bajo (<40) ---")
        for r in low:
            title_preview = str(r['title'] or '')[:60]
            print(f"  [{r['verification_score']:>3}] {title_preview!r} ({r['source']})")
            for dim in r["verification_reasons"]:
                if dim["score"] < dim["max"]:
                    reason_text = str(dim['reason'])
                    print(f"        {dim['dimension']}: {dim['score']}/{dim['max']} - {reason_text}")

    # Guardar reporte en tmp/
    out_dir = ROOT / "tmp" / "scoring"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = out_dir / f"score_report_{ts}.json"
    report_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nReporte guardado en {report_path}")

    if args.apply:
        print(f"\nAplicando scores a Supabase ({len(results)} registros)...")
        updated = apply_scores(supabase_url, service_key, results)
        print(f"  {updated}/{len(results)} filas actualizadas")
    else:
        print("\n(Modo preview — usar --apply para escribir en Supabase)")


if __name__ == "__main__":
    main()

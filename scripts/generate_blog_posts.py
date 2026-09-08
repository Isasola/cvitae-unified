#!/usr/bin/env python3
"""
generate_blog_posts.py
Runs weekly via GitHub Actions.
Reads newly verified opportunities from SS-tier sources,
calls Gemini to write a blog article draft, and saves it
to content_hub (is_active=False) for admin approval.
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def sb_get(table, params=""):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}{params}", headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def sb_post(table, data):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, json=data, timeout=15)
    r.raise_for_status()


def get_ss_opportunities():
    """Return verified opportunities from SS-tier sources in the last 7 days."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    sources_raw = sb_get("opportunity_sources", "?select=source&source_tier=eq.SS")
    ss_sources = [s["source"] for s in sources_raw]

    if not ss_sources:
        print("No SS sources configured yet — exiting.")
        sys.exit(0)

    source_in = "(" + ",".join(ss_sources) + ")"

    opps = sb_get(
        "opportunities",
        f"?select=id,title,organization,description,opportunity_type,opportunity_kind,"
        f"deadline,source,location,eligible_countries"
        f"&verification_status=eq.verified"
        f"&is_active=eq.true"
        f"&source=in.{source_in}"
        f"&created_at=gte.{since}"
        f"&order=created_at.desc"
        f"&limit=20",
    )
    return opps


def group_by_theme(opps):
    """Return list of (theme_key, [opp, ...]) tuples worth writing about."""
    scholarships = [
        o for o in opps
        if o.get("opportunity_type") in ("scholarship", "fellowship")
        or o.get("opportunity_kind") == "beca"
    ]
    programs = [
        o for o in opps
        if o.get("opportunity_type") in ("grant", "exchange_program", "training", "accelerator")
    ]

    groups = []
    if len(scholarships) >= 2:
        groups.append(("becas", scholarships[:5]))
    if len(programs) >= 2:
        groups.append(("programas", programs[:5]))
    if not groups and len(opps) >= 2:
        groups.append(("oportunidades", opps[:5]))
    return groups


def already_ran_this_week():
    """Skip if we already generated a draft this week."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    existing = sb_get(
        "content_hub",
        f"?select=id&tipo=eq.blog&is_active=eq.false&created_at=gte.{since}&limit=1",
    )
    return len(existing) > 0


def call_gemini(prompt):
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.65, "maxOutputTokens": 4096},
    }
    r = requests.post(url, json=payload, timeout=60)
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


PROMPT_TEMPLATE = """Escribí un artículo de blog en español rioplatense de 1200-1500 palabras
sobre las siguientes {theme} verificadas en CVitae para Paraguay y América Latina.

OPORTUNIDADES DISPONIBLES:
{opp_list}

REGLAS OBLIGATORIAS:
- Sin emojis en títulos H2 ni en ninguna parte del texto
- Una sección H2 por oportunidad: descripción, requisitos, cómo aplicar desde Paraguay
- Sección final H2: "Cómo preparar tu postulación"
- Bloque FAQ al final con exactamente 5 preguntas y respuestas cortas
- Tono: directo, informativo, sin relleno
- Mencioná cvitae.lat al menos dos veces con link markdown: [cvitae.lat](https://cvitae.lat)
- La última pregunta del FAQ debe ser: "¿Cómo puedo recibir alertas de nuevas convocatorias?"

Respondé EXCLUSIVAMENTE con un JSON válido (sin markdown, sin texto extra):
{{"titulo": "...", "slug": "...", "cuerpo": "...(markdown completo)..."}}"""


def generate_article(theme, opps):
    opp_list = "\n".join(
        f"- {o['title']} | {o.get('organization', 'N/A')} | "
        f"cierre: {o.get('deadline', 'sin fecha')} | fuente: {o['source']}"
        for o in opps
    )
    raw = call_gemini(PROMPT_TEMPLATE.format(theme=theme, opp_list=opp_list))

    # Strip markdown code fences if Gemini wraps it
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())

    return json.loads(raw)


def save_draft(article, trigger_source):
    slug_base = re.sub(r"[^a-z0-9]+", "-", article.get("slug", article["titulo"]).lower()).strip("-")
    slug = f"{slug_base[:70]}-{datetime.now().strftime('%Y%m%d')}"

    row = {
        "tipo": "blog",
        "titulo": article["titulo"][:200],
        "slug": slug,
        "cuerpo": article["cuerpo"],
        "categoria": "Becas" if "beca" in article["titulo"].lower() else "Oportunidades",
        "ubicacion": "Paraguay / LATAM",
        "is_active": False,
        "metadata": {
            "auto_generated": True,
            "needs_review": True,
            "trigger_source": trigger_source,
            "tier": "SS",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    sb_post("content_hub", row)
    print(f"  Draft saved: {article['titulo'][:70]}")


def main():
    print(f"[blog-generator] {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}")

    if already_ran_this_week():
        print("Already generated a draft this week — skipping.")
        sys.exit(0)

    opps = get_ss_opportunities()
    print(f"Found {len(opps)} SS opportunities from the last 7 days")

    if len(opps) < 2:
        print("Not enough opportunities (need ≥ 2) — exiting.")
        sys.exit(0)

    groups = group_by_theme(opps)
    print(f"Will generate {len(groups)} article(s): {[g[0] for g in groups]}")

    for theme, theme_opps in groups:
        try:
            print(f"\nGenerating '{theme}' ({len(theme_opps)} opps)...")
            article = generate_article(theme, theme_opps)
            save_draft(article, theme_opps[0]["source"])
        except Exception as exc:
            print(f"  Error on '{theme}': {exc}")

    print("\nDone.")


if __name__ == "__main__":
    main()

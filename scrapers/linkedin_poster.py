"""
LinkedIn Auto-Poster para CVitae.
Publica cada hora las 3 mejores oportunidades nuevas de Supabase.

SETUP:
1. Crear una LinkedIn App en https://www.linkedin.com/developers/apps
2. Habilitar permisos: w_member_social, r_liteprofile
3. Generar access token (válido 60 días, luego hay que renovar)
4. Variables de entorno:
   LINKEDIN_ACCESS_TOKEN  — token de acceso OAuth2
   LINKEDIN_PERSON_URN    — urn:li:person:{your_id} (se obtiene del perfil)
   LINKEDIN_ORG_URN       — (opcional) urn:li:organization:{id} para postear como empresa
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY

CRON (GitHub Actions): .github/workflows/linkedin_poster.yml — cada hora
"""
import requests
import os
import json
from datetime import datetime, timezone, timedelta

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
LINKEDIN_TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN", "")
LINKEDIN_PERSON_URN = os.environ.get("LINKEDIN_PERSON_URN", "")
LINKEDIN_ORG_URN = os.environ.get("LINKEDIN_ORG_URN", "")  # post as company if set

DB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

LI_HEADERS = {
    "Authorization": f"Bearer {LINKEDIN_TOKEN}",
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
}

# Priority order for posting: Paraguay first, then internacionales/becas
SOURCE_PRIORITY = [
    "computrabajo",
    "buscojobs",
    "abc_color",
    "clasipar",
    "oyaop",
    "opportunitydesk",
    "becal",
    "fundacion_carolina",
    "unjobs",
    "remotive",
    "arbeitnow",
    "weworkremotely",
    "himalayas",
    "jobicy",
]

TYPE_EMOJIS = {
    "Beca": "🎓",
    "Fellowship": "🌐",
    "Capital Semilla": "💡",
    "Pasantía": "📋",
    "Concurso": "🏆",
    "Curso": "📚",
    "Remoto": "💻",
    "Tiempo completo": "💼",
    "Oportunidad": "✨",
}


def get_recent_unseen_opportunities(limit=5):
    """Fetch opportunities added in the last 25 hours, not yet posted."""
    since = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    params = {
        "select": "id,titulo,organization,location,rubro,type,application_url,source,created_at",
        "is_active": "eq.true",
        "created_at": f"gte.{since}",
        "order": "created_at.desc",
        "limit": limit * 3,  # fetch more, filter down
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/opportunities",
            headers=DB_HEADERS,
            params=params,
            timeout=15,
        )
        if r.status_code != 200:
            print(f"Supabase error: {r.status_code}")
            return []
        return r.json()
    except Exception as e:
        print(f"fetch error: {e}")
        return []


def get_already_posted_ids():
    """Check which IDs were already posted (stored in a simple log table or env var)."""
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/linkedin_posts?select=opportunity_id&order=created_at.desc&limit=100",
            headers=DB_HEADERS,
            timeout=10,
        )
        if r.status_code == 200:
            return {row["opportunity_id"] for row in r.json()}
    except Exception:
        pass
    return set()


def mark_as_posted(opportunity_id, linkedin_post_id):
    """Record that this opportunity was posted to LinkedIn."""
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/linkedin_posts",
            headers={**DB_HEADERS, "Content-Type": "application/json"},
            json={
                "opportunity_id": opportunity_id,
                "linkedin_post_id": linkedin_post_id,
            },
            timeout=10,
        )
    except Exception:
        pass


def build_post_text(opp):
    emoji = TYPE_EMOJIS.get(opp.get("type", ""), "🔔")
    tipo = opp.get("type", "Oportunidad")
    titulo = opp.get("titulo", "")
    org = opp.get("organization", "")
    location = opp.get("location", "")
    rubro = opp.get("rubro", "")
    url = opp.get("application_url", "")
    source = opp.get("source", "")

    # Build hashtags from rubro + source
    tags = []
    if "paraguay" in (location + source).lower():
        tags.extend(["#Paraguay", "#EmpleosParaguay"])
    if rubro:
        rubro_tag = "#" + rubro.replace(" ", "").replace("y", "Y").replace("é", "e").replace("í", "i")
        tags.append(rubro_tag)
    if "beca" in tipo.lower() or "fellowship" in tipo.lower():
        tags.extend(["#Becas", "#Oportunidades"])
    if "remot" in tipo.lower():
        tags.extend(["#TrabajoRemoto", "#RemoteWork"])
    tags.append("#CVitae")

    org_line = f"🏢 {org}" if org else ""
    loc_line = f"📍 {location}" if location else ""

    parts = [
        f"{emoji} *{tipo}* — {titulo}",
        "",
    ]
    if org_line:
        parts.append(org_line)
    if loc_line:
        parts.append(loc_line)
    parts += [
        "",
        f"👉 Postulá y adaptá tu CV con IA para esta oportunidad: {url}",
        "",
        "🤖 CVitae te genera un CV adaptado específicamente para esta oferta — gratis durante la beta.",
        "Registrate en cvitae.lat",
        "",
        " ".join(tags[:6]),
    ]

    return "\n".join(parts)


def post_to_linkedin(text):
    """Post using LinkedIn UGC Posts API."""
    author = LINKEDIN_ORG_URN if LINKEDIN_ORG_URN else LINKEDIN_PERSON_URN
    if not author:
        print("ERROR: No LINKEDIN_PERSON_URN or LINKEDIN_ORG_URN set")
        return None

    payload = {
        "author": author,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": text
                },
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }

    try:
        r = requests.post(
            "https://api.linkedin.com/v2/ugcPosts",
            headers=LI_HEADERS,
            json=payload,
            timeout=15,
        )
        if r.status_code in (200, 201):
            post_id = r.headers.get("x-restli-id", r.json().get("id", ""))
            return post_id
        else:
            print(f"LinkedIn API error {r.status_code}: {r.text[:200]}")
            return None
    except Exception as e:
        print(f"LinkedIn post error: {e}")
        return None


def select_best_opportunities(all_opps, already_posted, max_posts=3):
    """Pick top N by priority: Paraguay first, then by SOURCE_PRIORITY."""
    unseen = [o for o in all_opps if o["id"] not in already_posted]

    def priority(opp):
        src = opp.get("source", "")
        try:
            return SOURCE_PRIORITY.index(src)
        except ValueError:
            return len(SOURCE_PRIORITY)

    return sorted(unseen, key=priority)[:max_posts]


def main():
    if not LINKEDIN_TOKEN:
        print("ERROR: LINKEDIN_ACCESS_TOKEN no configurado")
        print("Ver scrapers/linkedin_poster.py para instrucciones de setup")
        return

    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Buscando oportunidades para postear...")

    all_recent = get_recent_unseen_opportunities(limit=50)
    print(f"  Oportunidades recientes: {len(all_recent)}")

    if not all_recent:
        print("  Sin oportunidades nuevas en las últimas 25 horas")
        return

    already_posted = get_already_posted_ids()
    to_post = select_best_opportunities(all_recent, already_posted, max_posts=3)
    print(f"  Seleccionadas para postear: {len(to_post)}")

    for opp in to_post:
        text = build_post_text(opp)
        print(f"\n  Posteando: {opp['titulo'][:50]}...")
        post_id = post_to_linkedin(text)
        if post_id:
            mark_as_posted(opp["id"], post_id)
            print(f"  ✓ Publicado (ID: {post_id})")
        else:
            print(f"  ✗ Error al publicar")

    print(f"\nListo. {len(to_post)} publicaciones realizadas.")


if __name__ == "__main__":
    main()

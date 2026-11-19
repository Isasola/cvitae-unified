#!/usr/bin/env python3
"""
notify_incomplete_signups.py
Runs daily via GitHub Actions.
Finds users who signed up (in Supabase Auth) but never completed their profile
(no row in user_master_profiles), and sends Isaias a notification email.
Also detects new profile completions not yet notified.
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RESEND_API_KEY = os.environ["RESEND_API_KEY"]
ADMIN_EMAIL = "contacto@cvitae.lat"
FROM_EMAIL = "CVitae Sistema <noreply@cvitae.lat>"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

TEST_EMAILS = {"brenda", "test", "lvg.elshini", "isasolaeche", "cpdparaguay", "cvitae.com.py"}


def is_test_email(email: str) -> bool:
    email_lower = email.lower()
    return any(t in email_lower for t in TEST_EMAILS)


def sb_get(path: str):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def sb_get_auth_users() -> list:
    """Get all auth users via admin API."""
    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=100",
        headers=HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    return r.json().get("users", [])


def sb_post(table: str, data: dict):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, json=data, timeout=15)
    r.raise_for_status()


def already_notified(email: str, event: str) -> bool:
    """Check email_log for an existing notification of this type."""
    key = f"incomplete_signup:{event}:{email}"
    rows = sb_get(f"email_log?idempotency_key=eq.{key}&limit=1&select=id")
    return len(rows) > 0


def log_notification(email: str, event: str):
    sb_post("email_log", {
        "user_id": None,
        "template": f"founder_{event}_notification",
        "recipient_email": ADMIN_EMAIL,
        "subject": f"[CVitae] {event}: {email}",
        "status": "sent",
        "idempotency_key": f"incomplete_signup:{event}:{email}",
        "metadata": {"source": "notify_incomplete_signups.py", "event": event},
    })


def send_resend(subject: str, html: str) -> bool:
    r = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        json={"from": FROM_EMAIL, "to": [ADMIN_EMAIL], "subject": subject, "html": html},
        timeout=15,
    )
    return r.status_code == 200


def build_admin_html(incomplete: list, new_profiles: list) -> str:
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    def mailto_reengage(email: str) -> str:
        import urllib.parse
        subject = urllib.parse.quote("¿Todo bien con CVitae?")
        body = urllib.parse.quote(
            "Hola,\n\n"
            "Te escribo yo, Isaias, el fundador de CVitae.\n\n"
            "Vi que te registraste pero no llegaste a completar tu perfil y quería escribirte. "
            "CVitae te ayuda a encontrar oportunidades reales — becas, empleos remotos, programas — "
            "todo verificado y pensado para Paraguay y LATAM.\n\n"
            "Si algo no funcionó bien cuando te registraste, o si tenés alguna duda, respondé este mensaje. "
            "También podés completar tu perfil desde acá: https://cvitae.lat/mi-carrera\n\n"
            "Saludos,\n"
            "Isaias\n"
            "CVitae — cvitae.lat"
        )
        return f"mailto:{email}?subject={subject}&body={body}"

    incomplete_rows = "".join(
        f"<tr><td style='padding:8px 12px;border-bottom:1px solid #1a1a1a'>{u['email']}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #1a1a1a;color:#a0a0a0'>{u['created_at'][:10]}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #1a1a1a'>"
        f"<a href='{mailto_reengage(u['email'])}' style='color:#c9a84c;text-decoration:none'>Enviar mensaje</a></td></tr>"
        for u in incomplete
    ) if incomplete else "<tr><td colspan='3' style='padding:12px;color:#555;text-align:center'>Ninguno</td></tr>"

    profile_rows = "".join(
        f"<tr><td style='padding:8px 12px;border-bottom:1px solid #1a1a1a'>{u['email']}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #1a1a1a;color:#a0a0a0'>{u['name']}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #1a1a1a'>"
        f"<a href='https://cvitae.lat/admin' style='color:#c9a84c;text-decoration:none'>Ver en Admin →</a></td></tr>"
        for u in new_profiles
    ) if new_profiles else "<tr><td colspan='3' style='padding:12px;color:#555;text-align:center'>Ninguno nuevo</td></tr>"

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#f5f0e8;font-family:system-ui,sans-serif;margin:0;padding:0">
<div style="max-width:640px;margin:0 auto;padding:32px 24px">
  <div style="color:#c9a84c;font-weight:bold;font-size:13px;letter-spacing:0.12em;margin-bottom:20px">RESUMEN DIARIO — CVitae</div>
  <p style="color:#a0a0a0;font-size:13px;margin:0 0 28px">{now_str}</p>

  <h2 style="font-size:16px;color:#f5f0e8;margin:0 0 12px">Registros incompletos (sin perfil)</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
    <thead><tr style="background:#111">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#555">Email</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#555">Fecha</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#555">Acción</th>
    </tr></thead>
    <tbody>{incomplete_rows}</tbody>
  </table>

  <h2 style="font-size:16px;color:#f5f0e8;margin:0 0 12px">Nuevos perfiles completados</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
    <thead><tr style="background:#111">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#555">Email</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#555">Nombre</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#555">Acción</th>
    </tr></thead>
    <tbody>{profile_rows}</tbody>
  </table>

  <div style="margin-top:24px">
    <a href="https://cvitae.lat/admin" style="background:#c9a84c;color:#0a0a0a;font-weight:700;font-size:13px;padding:12px 24px;text-decoration:none;display:inline-block">
      Abrir Admin →
    </a>
  </div>
  <p style="color:#333;font-size:11px;margin-top:24px">CVitae · Sistema automático de notificaciones</p>
</div></body></html>"""


def main():
    print(f"[notify-incomplete] {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}")

    auth_users = sb_get_auth_users()
    real_users = [u for u in auth_users if u.get("email") and not is_test_email(u["email"])]
    print(f"Real auth users: {len(real_users)}")

    # Get all existing profiles
    profiles = sb_get("user_master_profiles?select=user_id,email,full_name,created_at&is_test=eq.false")
    profile_user_ids = {p["user_id"] for p in profiles}

    # Find auth users without profiles
    incomplete = []
    for u in real_users:
        if u["id"] not in profile_user_ids:
            if not already_notified(u["email"], "incomplete_signup"):
                incomplete.append({"email": u["email"], "created_at": u.get("created_at", "")})

    # Find new profile completions in last 7 days not yet notified
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_profiles = []
    for p in profiles:
        if not p.get("full_name"):
            continue
        # Find email from auth users
        auth_match = next((u for u in real_users if u["id"] == p["user_id"]), None)
        if not auth_match:
            continue
        email = auth_match.get("email", "")
        if p.get("created_at", "") >= week_ago and not already_notified(email, "profile_completed"):
            new_profiles.append({"email": email, "name": p["full_name"], "user_id": p["user_id"]})

    print(f"Incomplete signups to notify: {len(incomplete)}")
    print(f"New profiles to notify: {len(new_profiles)}")

    if not incomplete and not new_profiles:
        print("Nothing new to report today.")
        return

    html = build_admin_html(incomplete, new_profiles)
    subject = f"[CVitae] Resumen: {len(incomplete)} incompletos, {len(new_profiles)} perfiles nuevos"
    ok = send_resend(subject, html)
    print(f"Email sent: {ok}")

    if ok:
        for u in incomplete:
            log_notification(u["email"], "incomplete_signup")
        for p in new_profiles:
            log_notification(p["email"], "profile_completed")

    print("Done.")


if __name__ == "__main__":
    main()

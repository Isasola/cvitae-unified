"""
Script de uso único para obtener el Access Token de LinkedIn.
Abre el browser automáticamente, captura el código OAuth y lo intercambia por el token.

Uso:
  python scrapers/get_linkedin_token.py
"""
import http.server
import webbrowser
import urllib.parse
import urllib.request
import json
import threading

CLIENT_ID = "77jb4u04hs2916"
REDIRECT_URI = "http://localhost:8080"
SCOPE = "w_member_social w_organization_social r_liteprofile"
STATE = "cvitae2026"

auth_url = (
    f"https://www.linkedin.com/oauth/v2/authorization"
    f"?response_type=code"
    f"&client_id={CLIENT_ID}"
    f"&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
    f"&scope={urllib.parse.quote(SCOPE)}"
    f"&state={STATE}"
)

captured_code = [None]


class CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code = params.get("code", [None])[0]
        error = params.get("error", [None])[0]

        if error:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<h2>Error: acceso denegado. Cerrá esta ventana.</h2>")
            print(f"\nError de LinkedIn: {error}")
        elif code:
            captured_code[0] = code
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<h2>Autorizado! Ya pods cerrar esta ventana y volver a la consola.</h2>")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Sin codigo")

    def log_message(self, format, *args):
        pass  # silenciar logs del servidor


def main():
    print("=== LinkedIn Token Generator para CVitae ===\n")
    client_secret = input("Pegá tu Primary Client Secret (no se guarda en ningún lado): ").strip()
    if not client_secret:
        print("Necesitás el Client Secret.")
        return

    print("\nAbriendo el browser para autorizar...")
    server = http.server.HTTPServer(("localhost", 8080), CallbackHandler)

    # Abrir browser en segundo plano
    threading.Timer(0.5, lambda: webbrowser.open(auth_url)).start()

    # Esperar el callback (una sola request)
    server.handle_request()

    code = captured_code[0]
    if not code:
        print("No se capturó el código. Intentá de vuelta.")
        return

    print(f"\nCódigo OAuth capturado. Intercambiando por token...")

    # Exchange code for token
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "client_secret": client_secret,
    }).encode()

    req = urllib.request.Request(
        "https://www.linkedin.com/oauth/v2/accessToken",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"Error al obtener token: {e.read().decode()}")
        return

    access_token = result.get("access_token", "")
    expires_in = result.get("expires_in", 0)
    days = expires_in // 86400

    print("\n" + "="*50)
    print(f"ACCESS TOKEN (válido {days} días):")
    print(access_token)
    print("="*50)
    print("\nCopiá ese token y pegalo en GitHub Secrets como LINKEDIN_ACCESS_TOKEN")
    print(f"También guardalo — expira en {days} días y tenés que renovarlo.")


if __name__ == "__main__":
    main()

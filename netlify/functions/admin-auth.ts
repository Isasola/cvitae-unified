import { Handler } from "@netlify/functions"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cvitae2026admin"
  const { password } = JSON.parse(event.body || "{}")

  if (password === ADMIN_PASSWORD) {
    return { statusCode: 200, body: JSON.stringify({ authenticated: true }) }
  }
  return { statusCode: 401, body: JSON.stringify({ authenticated: false, error: "Contraseña incorrecta" }) }
}

export { handler }

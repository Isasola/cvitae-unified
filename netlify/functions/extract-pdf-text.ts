import { Handler } from "@netlify/functions"
import * as pdfParse from "pdf-parse"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { pdfBase64 } = JSON.parse(event.body || "{}")
    if (!pdfBase64) throw new Error("No se proporcionó archivo PDF")

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const data = await pdfParse.default(pdfBuffer)

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, text: data.text }),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    }
  }
}

export { handler }

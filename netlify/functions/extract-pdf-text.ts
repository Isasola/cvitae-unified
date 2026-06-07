import * as pdfParse from "pdf-parse"

export const handler = async (event: any) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const pdfBase64 = body.pdfBase64 || body.file
    if (!pdfBase64) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No se proporcionó archivo PDF' }),
      }
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const data = await pdfParse.default(pdfBuffer)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text: data.text, success: true }),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    }
  }
}

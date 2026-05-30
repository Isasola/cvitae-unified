export const handler = async (event: any) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
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

    // Usar require dinámico — compatible con esbuild de Netlify
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(pdfBuffer)

    if (!data.text || data.text.trim().length < 20) {
      return {
        statusCode: 422,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'El PDF no tiene texto legible. Probá con un PDF que no sea imagen escaneada.' 
        }),
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text: data.text }),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Error procesando el PDF: ' + (error.message || 'Error desconocido')
      }),
    }
  }
}

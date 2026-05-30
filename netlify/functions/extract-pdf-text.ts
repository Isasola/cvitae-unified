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
    let text = ''

    try {
      // Intento 1: pdf-parse con require
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(pdfBuffer)
      text = data.text || ''
    } catch (parseError) {
      try {
        // Intento 2: leer el buffer como texto y extraer lo legible
        const rawText = pdfBuffer.toString('latin1')
        // Extraer texto legible entre streams PDF
        const matches = rawText.match(/BT[\s\S]*?ET/g) || []
        const extracted = matches
          .join(' ')
          .replace(/[^\x20-\x7E\xC0-\xFF]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        text = extracted.length > 50 ? extracted : rawText.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim()
      } catch {
        text = ''
      }
    }

    if (!text || text.trim().length < 20) {
      return {
        statusCode: 422,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'No pudimos leer el PDF. Intentá con un PDF de texto (no escaneado) o copiá el texto manualmente.',
        }),
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text: text.substring(0, 8000) }),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Error procesando el PDF: ' + (error.message || 'Error desconocido'),
      }),
    }
  }
}

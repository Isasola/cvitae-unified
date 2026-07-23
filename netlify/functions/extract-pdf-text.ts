import { PDFParse } from "pdf-parse"

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
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Método no permitido' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const pdfBase64 = body.pdfBase64 || body.file || body.fileBase64
    if (!pdfBase64) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No se proporcionó archivo PDF' }),
      }
    }

    if (typeof pdfBase64 !== 'string' || pdfBase64.length > 14_000_000) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'El archivo PDF no es válido o supera 10 MB' }),
      }
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'El archivo enviado no es un PDF válido' }),
      }
    }

    const parser = new PDFParse({ data: pdfBuffer })
    let text = ''
    try {
      const data = await parser.getText()
      text = data.text?.trim() || ''
    } finally {
      await parser.destroy()
    }
    if (!text || text.length < 50) {
      return {
        statusCode: 422,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No pudimos extraer suficiente texto. Probá con un PDF que contenga texto seleccionable.' }),
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text, success: true }),
    }
  } catch (error: any) {
    console.error('extract-pdf-text error:', error?.message || error)
    return {
      statusCode: 422,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'No pudimos leer el PDF. Verificá que no esté dañado o protegido con contraseña.' }),
    }
  }
}

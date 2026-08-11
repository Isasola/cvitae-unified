import mammoth from "mammoth"
import { extractPdfText } from "./lib/pdf"

const MAX_FILE_BYTES = 4 * 1024 * 1024

export const handler = async (event: any) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Método no permitido" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const fileBase64 = body.pdfBase64 || body.file || body.fileBase64
    const fileName = String(body.fileName || "cv.pdf").slice(0, 240)

    if (typeof fileBase64 !== "string" || !fileBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No se proporcionó ningún archivo" }) }
    }
    if (fileBase64.length > 5_600_000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: "El archivo supera 4 MB. Comprimilo o generá una versión optimizada desde Mi Carrera en CVitae." }) }
    }

    const fileBuffer = Buffer.from(fileBase64, "base64")
    if (!fileBuffer.length || fileBuffer.length > MAX_FILE_BYTES) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: "El archivo supera 4 MB. Comprimilo o generá una versión optimizada desde Mi Carrera en CVitae." }) }
    }

    const extension = fileName.toLowerCase().split(".").pop()
    let extracted = ""
    if (extension === "pdf") {
      if (fileBuffer.length < 5 || fileBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "El archivo enviado no es un PDF válido" }) }
      }
      extracted = await extractPdfText(fileBuffer)
    } else if (extension === "docx") {
      extracted = (await mammoth.extractRawText({ buffer: fileBuffer })).value
    } else if (extension === "txt") {
      extracted = fileBuffer.toString("utf8")
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Formato no soportado. Usá PDF, DOCX o TXT." }) }
    }

    const text = extracted.replace(/\u0000/g, "").trim().slice(0, 50_000)
    if (text.length < 50) {
      return { statusCode: 422, headers, body: JSON.stringify({ error: "No pudimos extraer suficiente texto. Si el CV está escaneado, generá una versión optimizada desde Mi Carrera en CVitae." }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text, success: true }) }
  } catch (error: any) {
    console.error("extract-cv-text error:", error?.message || error)
    return { statusCode: 422, headers, body: JSON.stringify({ error: "No pudimos leer el archivo. Verificá que no esté dañado o protegido con contraseña." }) }
  }
}

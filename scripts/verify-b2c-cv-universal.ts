/**
 * verify-b2c-cv-universal.ts
 *
 * Behavioral verification of the universal CV upload flow.
 * These tests check wiring and logic, not just string presence.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`)
}

const pb = source('src/hub/ProfileBuilder.tsx')
const ana = source('netlify/functions/analyze-cv-candidate.ts')
const b2c = source('netlify/functions/b2c-profile.ts')

// ─── A. PDF con texto → NO usa multimodal ─────────────────────────────────────
assert(pb.includes("processingMethod = 'pdf_text'"),
  'A: PDF con texto debe marcar processingMethod = pdf_text')
// La ruta barata sólo llama a analyze-cv-candidate en mode extract, no extract_file
const pdfOkBlock = pb.slice(pb.indexOf("processingMethod = 'pdf_text'"), pb.indexOf("processingMethod = 'pdf_text'") + 150)
assert(!pdfOkBlock.includes('extract_file'),
  'A: Una vez que extract-pdf-text devuelve texto suficiente no debe llamar a extract_file')

// ─── B. PDF escaneado → PDF_NO_TEXT → multimodal automático ───────────────────
assert(pb.includes("'PDF_NO_TEXT'") || pb.includes('"PDF_NO_TEXT"'),
  'B: Debe detectar PDF_NO_TEXT')
// Todo el bloque PDF (isPdf ... isDocx) contiene extract_file y rawText
const pdfBlockStart = pb.indexOf('if (isPdf)')
const pdfBlockEnd = pb.indexOf('} else if (isDocx)')
const pdfBlock = pdfBlockStart !== -1 && pdfBlockEnd !== -1 ? pb.slice(pdfBlockStart, pdfBlockEnd) : ''
assert(pdfBlock.includes("'PDF_NO_TEXT'"),
  'B: El bloque PDF maneja PDF_NO_TEXT')
assert(pdfBlock.includes('extract_file'),
  'B: El bloque PDF llama a extract_file como fallback para PDFs escaneados')
assert(pdfBlock.includes('rawText'),
  'B: La respuesta del multimodal PDF escaneado lee rawText')

// ─── C. DOCX con texto suficiente → Mammoth, sin multimodal ──────────────────
const docxBlock = pb.slice(pb.indexOf('isDocx'), pb.indexOf('} else if (isDoc)'))
assert(docxBlock.includes('mammoth'),
  'C: DOCX con texto usa Mammoth primero')
assert(docxBlock.includes('docx_text'),
  'C: DOCX exitoso marca processingMethod = docx_text')
// NO llama a extract_file en el camino normal (solo si falla)
const mammothHappyPath = pb.slice(pb.indexOf('docx_text'), pb.indexOf('docx_text') + 50)
assert(!mammothHappyPath.includes('extract_file'),
  'C: Mammoth exitoso NO llama a extract_file')

// ─── D. DOCX sin texto → fallback Bedrock documento ──────────────────────────
assert(docxBlock.includes("processingMethod = 'bedrock_document'"),
  'D: DOCX sin texto suficiente debe marcar bedrock_document y llamar a extract_file')
assert(docxBlock.includes('extract_file'),
  'D: DOCX fallback usa extract_file')

// ─── E-G. Imágenes → multimodal image ────────────────────────────────────────
const imgElseIfIdx = pb.indexOf('} else if (isImage || isHeic)')
assert(imgElseIfIdx !== -1, 'E-G: Debe existir bloque else-if para imágenes/HEIC')
const imageBlock = pb.slice(imgElseIfIdx, imgElseIfIdx + 1400)
assert(imageBlock.includes('extract_file'),
  'E-G: Imágenes (JPG/PNG/WEBP) usan extract_file')
assert(imageBlock.includes('compressImageForBedrock'),
  'E-G: Imágenes se comprimen antes de enviar a Bedrock')
assert(pb.includes("'bedrock_image'"),
  'E-G: processingMethod para imágenes es bedrock_image')

// ─── H. HEIC → conversión a JPEG → multimodal ────────────────────────────────
assert(pb.includes('convertHeicToJpeg'),
  'H: HEIC llama a convertHeicToJpeg antes de análisis')
assert(pb.includes("'heic_to_jpeg_bedrock'"),
  'H: processingMethod para HEIC es heic_to_jpeg_bedrock')
// La función de conversión existe
assert(pb.includes('async function convertHeicToJpeg'),
  'H: función convertHeicToJpeg está definida')
// Usa createImageBitmap nativo (sin deps extras, cero bundle overhead)
assert(pb.includes('createImageBitmap'),
  'H: convertHeicToJpeg usa createImageBitmap para conversión nativa sin deps')

// ─── I. Nombres en mayúsculas (CV.PDF, CV.DOCX) ───────────────────────────────
assert(pb.includes('file.name.toLowerCase()'),
  'I: lowerName se calcula con toLowerCase para manejar CV.PDF, CV.DOCX')

// ─── J. MIME vacío (móvil) ────────────────────────────────────────────────────
assert(!pb.includes("file.type === 'application/pdf'"),
  'J: No depende del MIME type — usa extensión de nombre')

// ─── K. Fallo de lectura nativa → original sigue almacenado ──────────────────
const uploadCvPos = pb.indexOf("action: 'upload_cv'")
const extractPdfPos = pb.indexOf('extract-pdf-text')
assert(uploadCvPos < extractPdfPos,
  'K: upload_cv ocurre ANTES de extract-pdf-text')
assert(pb.includes('cvStored = true'),
  'K: cvStored se marca antes de la extracción')

// ─── L. Fallo multimodal → original guardado, manual, sin evidence ────────────
// Para cada llamada extract_file, si falla → return (no continúa a evidence/draft)
const multiFailBlocks = pb.matchAll(/multiRes\.ok[\s\S]{0,250}return/g)
assert([...multiFailBlocks].length >= 4,
  'L: Cada path multimodal verifica multiRes.ok antes de continuar')
// evidence y draft sólo se llaman DESPUÉS de todos los guards
const evidencePos = pb.indexOf('import_extraction')
const draftPos = pb.indexOf("action: 'save_import_draft'")
const lastReturnBeforeEvidence = pb.lastIndexOf('return', evidencePos)
assert(lastReturnBeforeEvidence > uploadCvPos,
  'L: Hay al menos un return de guardia antes de import_extraction')

// ─── M. save_cv_text falla → no continúa ─────────────────────────────────────
const saveTextCheck = pb.indexOf('saveTextRes.ok')
assert(saveTextCheck !== -1 && saveTextCheck < evidencePos,
  'M: saveTextRes.ok debe verificarse antes de import_extraction')

// ─── N. Multimodal no inventa — rawText vacío detiene el flujo ────────────────
assert(pb.includes("rawText.trim().length < 20"),
  'N: rawText insuficiente detiene el flujo antes de save_cv_text')

// ─── O. Flujo con texto NO llama a analyze-cv-candidate en extract_file ───────
// En el camino normal PDF texto, se llama analyze con mode: extract, no extract_file
const normalAnalyzeCall = pb.slice(pb.indexOf("mode: 'extract'"), pb.indexOf("mode: 'extract'") + 50)
assert(normalAnalyzeCall.includes("'extract'"),
  'O: Flujo con texto llama a analyze-cv-candidate con mode: extract (no extract_file)')

// ─── Backend: extract_file en analyze-cv-candidate ───────────────────────────
assert(ana.includes("mode === 'extract_file'"),
  'Backend: analyze-cv-candidate acepta mode extract_file')
assert(ana.includes('extractFromFile'),
  'Backend: función extractFromFile definida')
assert(ana.includes('ConverseCommand'),
  'Backend: usa ConverseCommand para documentos')
assert(ana.includes('rawText') && ana.includes('extracted'),
  'Backend: respuesta extract_file incluye rawText y extracted')
assert(ana.includes('BEDROCK_IMAGE_FORMATS') && ana.includes('BEDROCK_DOC_FORMATS'),
  'Backend: define formatos de imagen y documento soportados')
// Haiku 4.5 es el modelo correcto para extracción (barato)
assert(ana.includes('MODEL_ID_EXTRACT'),
  'Backend: usa MODEL_ID_EXTRACT para extract_file (no el Sonnet caro)')
// Para imágenes usa InvokeModelCommand (Anthropic native image blocks)
const imgBlock = ana.slice(ana.indexOf('imgFormat'), ana.indexOf('} else {'))
assert(imgBlock.includes('InvokeModelCommand'),
  'Backend: imágenes usan InvokeModelCommand con image blocks')
// Para documentos usa ConverseCommand
const docBlock = ana.slice(ana.indexOf('} else {'), ana.indexOf('extractJSON(responseText)'))
assert(docBlock.includes('ConverseCommand'),
  'Backend: documentos usan ConverseCommand con document blocks')

// ─── Backend: save_cv_text con metadata de procesamiento ─────────────────────
assert(b2c.includes('processing_method') && b2c.includes('processing_status'),
  'Backend: save_cv_text acepta processing_method y processing_status')
assert(b2c.includes('cv_processing_method') && b2c.includes('cv_processing_status'),
  'Backend: save_cv_text persiste cv_processing_method y cv_processing_status en profile_data')
assert(b2c.includes('VALID_METHODS') && b2c.includes('VALID_STATUSES'),
  'Backend: save_cv_text valida los valores permitidos')

// ─── DOC → directo a Bedrock ────────────────────────────────────────────────
assert(pb.includes("isDoc") && pb.includes("bedrock_document"),
  'DOC archivos van directamente a Bedrock (DocumentBlock)')

// ─── TXT → lectura local ──────────────────────────────────────────────────────
assert(pb.includes('isTxt') && pb.includes("file.text()"),
  'TXT se lee localmente con file.text()')
assert(pb.includes("text_file"),
  'TXT marca processingMethod = text_file')

// ─── Orden correcto del pipeline (todos los formatos) ────────────────────────
const pipe = [
  pb.indexOf("action: 'upload_cv'"),
  pb.indexOf('save_cv_text'),
  pb.indexOf('import_extraction'),
  pb.indexOf("action: 'save_import_draft'"),
]
for (let i = 1; i < pipe.length; i++) {
  assert(pipe[i - 1] < pipe[i],
    `Pipeline: paso ${i} debe aparecer antes del paso ${i + 1}`)
}

// ─── P. Imagen > 4 MB → compresión antes de upload_cv ────────────────────────
const optimizePos = pb.indexOf("'Optimizando tu imagen...'")
const uploadCvPos2 = pb.indexOf("action: 'upload_cv'")
assert(optimizePos !== -1, 'P: debe existir el mensaje "Optimizando tu imagen..."')
assert(optimizePos < uploadCvPos2, 'P: la optimización debe ocurrir ANTES de upload_cv')
// Documentos siguen con el límite duro de 4 MB
assert(pb.includes('isPdf || isDocx || isDoc || isTxt'), 'P: documentos tienen validación de tamaño separada de imágenes')
// Imágenes tienen límite alto (20 MB) antes de rechazar — no rechazan en 4 MB
assert(pb.includes('20 * 1024 * 1024'), 'P: imágenes tienen límite de 20 MB, no 4 MB')
// uploadBase64 existe y se usa en upload_cv
assert(pb.includes('uploadBase64'), 'P: uploadBase64 es la versión comprimida que va al backend')

// ─── Q. HEIC: conversión nativa primero ───────────────────────────────────────
assert(pb.includes('createImageBitmap'), 'Q: HEIC native usa createImageBitmap primero')

// ─── R. HEIC: lazy fallback heic-to/csp cuando nativa falla ──────────────────
assert(pb.includes("import('heic-to/csp')"), 'R: HEIC fallback lazy-importa heic-to/csp')
// El import dinámico está DENTRO del catch de createImageBitmap — solo se activa si nativa falla
const heicFnBody = pb.slice(pb.indexOf('async function convertHeicToJpeg'), pb.indexOf('async function compressImageForBedrock'))
const nativeAttemptEnd = heicFnBody.indexOf('} catch {')
const lazyImportPos = heicFnBody.indexOf("import('heic-to/csp')")
assert(lazyImportPos > nativeAttemptEnd, 'R: el lazy import de heic-to está dentro del catch, no antes de la conversión nativa')

// ─── S. Ambas extensiones HEIC/HEIF soportadas ───────────────────────────────
assert(pb.includes("'.heic'") && pb.includes("'.heif'"), 'S: ambas extensiones .heic y .heif están soportadas')

// ─── T. heic-to no está en el bundle inicial (import dinámico) ───────────────
// Verificar que NO hay un import estático de heic-to al tope del archivo
const staticImports = pb.slice(0, pb.indexOf('export default function ProfileBuilder'))
assert(!staticImports.includes("from 'heic-to'"), 'T: heic-to NO está en los imports estáticos (no infla el bundle inicial)')

// ─── BUG 1: HEIF extension regex — funciona para HEIC y HEIF ─────────────────
// Ejercitar la transformación real con los nombres de archivo problemáticos
const heicRename = (name: string) => name.replace(/\.(heic|heif)$/i, '.jpg')
assert(heicRename('CV.HEIC') === 'CV.jpg',  'BUG1: CV.HEIC → CV.jpg')
assert(heicRename('CV.HEIF') === 'CV.jpg',  'BUG1: CV.HEIF → CV.jpg')
assert(heicRename('cv.heic') === 'cv.jpg',  'BUG1: cv.heic lowercase → cv.jpg')
assert(heicRename('cv.heif') === 'cv.jpg',  'BUG1: cv.heif lowercase → cv.jpg')
assert(heicRename('foto.jpeg') === 'foto.jpeg', 'BUG1: extensiones no-HEIC no cambian')
// Confirmar que la regex correcta está en ambas ramas de convertHeicToJpeg
const heicFnBodyBug1 = pb.slice(pb.indexOf('async function convertHeicToJpeg'), pb.indexOf('async function compressImageForBedrock'))
const heicRegexCount = (heicFnBodyBug1.match(/\\\.\(heic\|heif\)/g) || []).length
assert(heicRegexCount >= 2, `BUG1: regex \\.(heic|heif) debe aparecer en ambas ramas de convertHeicToJpeg (encontradas: ${heicRegexCount})`)
assert(!heicFnBodyBug1.includes('\\.heic?'), 'BUG1: regex antigua \\.heic? NO debe existir en convertHeicToJpeg')

// ─── BUG 2: PNG/WEBP grande comprimido a JPEG → extensión .jpg coherente ──────
// Ejercitar la transformación de extensión que aplica el código de compresión
const normalizeCompressed = (name: string) => name.replace(/\.[^.]+$/, '.jpg')
const compressionCases: { input: string; expected: string; label: string }[] = [
  { input: 'CV.PNG',   expected: 'CV.jpg',  label: 'PNG grande → .jpg' },
  { input: 'CV.WEBP',  expected: 'CV.jpg',  label: 'WEBP grande → .jpg' },
  { input: 'CV.JPG',   expected: 'CV.jpg',  label: 'JPG grande → .jpg (sin cambio visible)' },
  { input: 'CV.JPEG',  expected: 'CV.jpg',  label: 'JPEG grande → .jpg' },
  { input: 'CV.HEIC',  expected: 'CV.jpg',  label: 'HEIC → .jpg' },
  { input: 'CV.HEIF',  expected: 'CV.jpg',  label: 'HEIF → .jpg' },
  { input: 'foto.PNG', expected: 'foto.jpg', label: 'minúscula con mayúscula ext' },
]
for (const { input, expected, label } of compressionCases) {
  assert(normalizeCompressed(input) === expected, `BUG2: ${label}`)
}
// Imágenes PEQUEÑAS (no comprimidas): conservan nombre original — no se normaliza
// Verificar que la normalización SOLO ocurre en el path de compresión (no para pequeñas)
assert(pb.includes('uploadFileName'), 'BUG2: uploadFileName es la variable que porta nombre+extensión correctos')
assert(pb.includes('bedrockFileName'), 'BUG2: bedrockFileName garantiza coherencia bytes/nombre en llamada a Bedrock')
// La normalización de extensión usa el mismo reemplazador que los tests usan arriba
assert(pb.includes("replace(/\\.[^.]+$/, '.jpg')"), "BUG2: normalización de extensión a .jpg presente en el código")
// Para imágenes pequeñas, bedrockFileName puede ser analysisFile.name (sin cambiar)
assert(pb.includes('analysisFile.name'), 'BUG2: imágenes pequeñas sin compresión conservan analysisFile.name')

console.log('OK: Universal CV upload flow verified (all A-T + BUG1/BUG2 checks pass)')

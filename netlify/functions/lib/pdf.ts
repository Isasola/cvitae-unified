import pdfjs from "pdfjs-dist/legacy/build/pdf.js"
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.js"

export async function extractPdfText(buffer: Buffer): Promise<string> {
  ;(globalThis as typeof globalThis & {
    pdfjsWorker: typeof pdfjsWorker
  }).pdfjsWorker = pdfjsWorker
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  })
  const document = await loadingTask.promise

  try {
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      )
      page.cleanup()
    }
    return pages.join("\n").trim()
  } finally {
    await document.destroy()
  }
}

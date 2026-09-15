import { createRequire } from "node:module"

const runtimeRequire = createRequire(__filename)

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Resolve the literal package path for Netlify's dependency tracer, then
  // dynamically import the resolved ESM file at runtime. This prevents esbuild
  // from converting PDF.js' top-level-await module to CJS.
  const pdfjsModule = runtimeRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs")
  const pdfjs = await import(pdfjsModule)
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

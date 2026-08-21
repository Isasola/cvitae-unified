/** Server-only SEO flags for the Node/Netlify runtime. */
export function serverSeoFlags() {
  return {
    SEO_PIPELINE_V2: process.env.SEO_PIPELINE_V2 === 'true',
    SEO_AI_SUGGESTIONS: process.env.SEO_AI_SUGGESTIONS === 'true',
    SEO_GOOGLE_INDEXING: process.env.SEO_GOOGLE_INDEXING === 'true',
    SEO_DRY_RUN: process.env.SEO_DRY_RUN !== 'false', // ON by default
  }
}

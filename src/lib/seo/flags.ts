/**
 * Feature flags for the SEO Automation Pipeline.
 * Default: all features OFF in prod until explicitly enabled.
 * DRY_RUN: all write/index operations are logged-only, never executed.
 */

export const SEO_FLAGS = {
  /** Run full normalization + eligibility on every approve action */
  SEO_PIPELINE_V2: import.meta.env.VITE_SEO_PIPELINE_V2 === 'true',

  /** Generate AI suggestions for ambiguous title/type/location fields */
  SEO_AI_SUGGESTIONS: import.meta.env.VITE_SEO_AI_SUGGESTIONS === 'true',

  /** Submit URL_UPDATED / URL_DELETED events to Google Indexing API */
  SEO_GOOGLE_INDEXING: import.meta.env.VITE_SEO_GOOGLE_INDEXING === 'true',

  /** All indexing writes are no-ops — safe to test without affecting Google quota */
  SEO_DRY_RUN: import.meta.env.VITE_SEO_DRY_RUN !== 'false', // ON by default
}

/** Server-side flags for Netlify functions (process.env) */
export function serverSeoFlags() {
  return {
    SEO_PIPELINE_V2: process.env.SEO_PIPELINE_V2 === 'true',
    SEO_AI_SUGGESTIONS: process.env.SEO_AI_SUGGESTIONS === 'true',
    SEO_GOOGLE_INDEXING: process.env.SEO_GOOGLE_INDEXING === 'true',
    SEO_DRY_RUN: process.env.SEO_DRY_RUN !== 'false', // ON by default
  }
}

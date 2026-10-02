export const TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09 = Object.freeze({
  name: 'TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09',
  canonicalSource: 'computrabajo',
  expiresOn: '2026-10-09',
  consumer: 'seo',
  scope: 'existing-first-party-seo-only',
})

export type TemporaryLegacySeoExceptionState = 'ACTIVE' | 'EXPIRED' | 'NOT_APPLICABLE'

/** Uses the server/build UTC calendar date. Callers must pass canonical source identity. */
export function temporaryLegacySeoExceptionState(canonicalSource: string, asOf = new Date()) {
  const state: TemporaryLegacySeoExceptionState = canonicalSource !== TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09.canonicalSource
    ? 'NOT_APPLICABLE'
    : asOf.toISOString().slice(0, 10) <= TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09.expiresOn ? 'ACTIVE' : 'EXPIRED'
  return {
    ...TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09,
    state,
    permissionState: canonicalSource === TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09.canonicalSource ? 'DENIED' as const : null,
  }
}

export function isQualifyingTemporaryLegacySeoRow(row: Record<string, unknown>): boolean {
  return row.seo_eligible === true
    && row.seo_status === 'eligible'
}

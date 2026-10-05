export const TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09 = Object.freeze({
  name: 'TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09',
  canonicalSource: 'computrabajo',
  expiresOn: '2026-10-09',
  legacyCutoff: '2026-10-03',
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

export function isQualifyingTemporaryLegacySeoRow(row: Record<string, unknown>, canonicalSource = String(row.source || '')): boolean {
  const created = Date.parse(String(row.created_at || ''))
  return canonicalSource === TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09.canonicalSource
    && row.seo_eligible === true
    && row.seo_status === 'eligible'
    && Number.isFinite(created)
    && new Date(created).toISOString().slice(0, 10) <= TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09.legacyCutoff
}

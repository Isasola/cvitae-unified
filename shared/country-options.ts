import { ISO_3166_ALPHA2_CODES } from './iso-countries'

/** UI options derive from the same strict ISO contract used by eligibility normalization. */
const countryNames = new Intl.DisplayNames(['es'], { type: 'region' })

export const COUNTRY_OPTIONS = ISO_3166_ALPHA2_CODES.map((code) => ({
  code,
  name: countryNames.of(code) ?? code,
}))

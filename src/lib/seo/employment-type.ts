import { toGoogleEmploymentType as implementation } from './employment-type.shared.js'

export function toGoogleEmploymentType(
  raw: string | null | undefined
): string | null {
  return implementation(raw)
}

/**
 * Converts raw `type` values from the opportunities table to valid Google Jobs employmentType.
 *
 * Valid Google Jobs values: FULL_TIME | PART_TIME | CONTRACTOR | TEMPORARY | INTERN | VOLUNTEER | PER_DIEM | OTHER
 * See: https://developers.google.com/search/docs/appearance/structured-data/job-posting#employment-type
 *
 * Rules:
 * - Only map values we can confidently identify — never guess or invent
 * - "Remoto" is NOT an employment type (it's a work modality) — return null
 * - "Beca", "Concurso Público", "Publicación en foro" — not employment types — return null
 * - null / empty / unknown — return null (field will be omitted from schema)
 */

const GOOGLE_EMPLOYMENT_TYPES = new Set([
  'FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER',
])

const MAPPING: Record<string, string> = {
  // Full time
  'tiempo completo': 'FULL_TIME',
  'full time': 'FULL_TIME',
  'full-time': 'FULL_TIME',
  'fulltime': 'FULL_TIME',
  'jornada completa': 'FULL_TIME',
  'jornada entera': 'FULL_TIME',
  // Part time
  'medio tiempo': 'PART_TIME',
  'part time': 'PART_TIME',
  'part-time': 'PART_TIME',
  'parttime': 'PART_TIME',
  'jornada parcial': 'PART_TIME',
  'media jornada': 'PART_TIME',
  // Contractor / Freelance
  'freelance': 'CONTRACTOR',
  'contratista': 'CONTRACTOR',
  'contractor': 'CONTRACTOR',
  'por contrato': 'CONTRACTOR',
  'consultoria': 'CONTRACTOR',
  'consultoría': 'CONTRACTOR',
  'consultancy': 'CONTRACTOR',
  // Temporary
  'temporal': 'TEMPORARY',
  'temporary': 'TEMPORARY',
  'plazo fijo': 'TEMPORARY',
  'plazo determinado': 'TEMPORARY',
  'fixed term': 'TEMPORARY',
  // Intern
  'pasantia': 'INTERN',
  'pasantía': 'INTERN',
  'internship': 'INTERN',
  'intern': 'INTERN',
  'practica': 'INTERN',
  'práctica': 'INTERN',
  'practicante': 'INTERN',
  'trainee': 'INTERN',
  // Volunteer
  'voluntario': 'VOLUNTEER',
  'voluntaria': 'VOLUNTEER',
  'voluntariado': 'VOLUNTEER',
  'volunteer': 'VOLUNTEER',
  // Per diem
  'per diem': 'PER_DIEM',
  'per_diem': 'PER_DIEM',
  // Other (only when source explicitly says "other")
  'otro': 'OTHER',
  'other': 'OTHER',
}

/**
 * Map a raw type string to a valid Google Jobs employmentType.
 * Returns null if the value cannot be confidently mapped (field will be omitted).
 */
export function toGoogleEmploymentType(raw: string | null | undefined): string | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return null

  // Already a valid Google value — accept as-is
  if (GOOGLE_EMPLOYMENT_TYPES.has(normalized.toUpperCase())) {
    return normalized.toUpperCase()
  }

  const mapped = MAPPING[normalized]
  return mapped ?? null // Unknown value → omit
}

const GOOGLE_EMPLOYMENT_TYPES = new Set([
  'FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY',
  'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER',
])

const MAPPING = {
  'tiempo completo': 'FULL_TIME',
  'full time': 'FULL_TIME',
  'full-time': 'FULL_TIME',
  'fulltime': 'FULL_TIME',
  'jornada completa': 'FULL_TIME',
  'jornada entera': 'FULL_TIME',

  'medio tiempo': 'PART_TIME',
  'part time': 'PART_TIME',
  'part-time': 'PART_TIME',
  'parttime': 'PART_TIME',
  'jornada parcial': 'PART_TIME',
  'media jornada': 'PART_TIME',

  'freelance': 'CONTRACTOR',
  'contratista': 'CONTRACTOR',
  'contractor': 'CONTRACTOR',
  'por contrato': 'CONTRACTOR',
  'consultoria': 'CONTRACTOR',
  'consultoría': 'CONTRACTOR',
  'consultancy': 'CONTRACTOR',

  'temporal': 'TEMPORARY',
  'temporary': 'TEMPORARY',
  'plazo fijo': 'TEMPORARY',
  'plazo determinado': 'TEMPORARY',
  'fixed term': 'TEMPORARY',

  'pasantia': 'INTERN',
  'pasantía': 'INTERN',
  'internship': 'INTERN',
  'intern': 'INTERN',
  'practica': 'INTERN',
  'práctica': 'INTERN',
  'practicante': 'INTERN',
  'trainee': 'INTERN',

  'voluntario': 'VOLUNTEER',
  'voluntaria': 'VOLUNTEER',
  'voluntariado': 'VOLUNTEER',
  'volunteer': 'VOLUNTEER',

  'per diem': 'PER_DIEM',
  'per_diem': 'PER_DIEM',

  'otro': 'OTHER',
  'other': 'OTHER',
}

export function toGoogleEmploymentType(raw) {
  if (!raw) return null
  const normalized = String(raw).trim().toLowerCase()
  if (!normalized) return null

  if (GOOGLE_EMPLOYMENT_TYPES.has(normalized.toUpperCase())) {
    return normalized.toUpperCase()
  }

  return MAPPING[normalized] ?? null
}
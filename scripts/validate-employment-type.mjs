/**
 * Validates the employmentType mapping against all known scraper values.
 * Run: node scripts/validate-employment-type.mjs
 */

const EMPLOYMENT_TYPE_MAPPING = {
  'tiempo completo': 'FULL_TIME', 'full time': 'FULL_TIME', 'full-time': 'FULL_TIME', 'fulltime': 'FULL_TIME',
  'jornada completa': 'FULL_TIME', 'jornada entera': 'FULL_TIME',
  'medio tiempo': 'PART_TIME', 'part time': 'PART_TIME', 'part-time': 'PART_TIME', 'parttime': 'PART_TIME',
  'jornada parcial': 'PART_TIME', 'media jornada': 'PART_TIME',
  'freelance': 'CONTRACTOR', 'contratista': 'CONTRACTOR', 'contractor': 'CONTRACTOR',
  'por contrato': 'CONTRACTOR', 'consultoria': 'CONTRACTOR', 'consultoría': 'CONTRACTOR', 'consultancy': 'CONTRACTOR',
  'temporal': 'TEMPORARY', 'temporary': 'TEMPORARY', 'plazo fijo': 'TEMPORARY',
  'pasantia': 'INTERN', 'pasantía': 'INTERN', 'internship': 'INTERN', 'intern': 'INTERN',
  'practica': 'INTERN', 'práctica': 'INTERN', 'practicante': 'INTERN', 'trainee': 'INTERN',
  'voluntario': 'VOLUNTEER', 'voluntaria': 'VOLUNTEER', 'voluntariado': 'VOLUNTEER', 'volunteer': 'VOLUNTEER',
  'per diem': 'PER_DIEM', 'per_diem': 'PER_DIEM',
  'otro': 'OTHER', 'other': 'OTHER',
}
const GOOGLE_VALID = new Set(['FULL_TIME','PART_TIME','CONTRACTOR','TEMPORARY','INTERN','VOLUNTEER','PER_DIEM','OTHER'])

function map(raw) {
  if (!raw) return null
  const n = String(raw).trim().toLowerCase()
  if (GOOGLE_VALID.has(n.toUpperCase())) return n.toUpperCase()
  return EMPLOYMENT_TYPE_MAPPING[n] ?? null
}

const KNOWN_SCRAPER_VALUES = [
  // These SHOULD map to a valid Google value
  { raw: 'Tiempo completo', expected: 'FULL_TIME' },
  { raw: 'tiempo completo', expected: 'FULL_TIME' },
  { raw: 'FULL_TIME', expected: 'FULL_TIME' },
  { raw: 'full-time', expected: 'FULL_TIME' },
  { raw: 'Medio tiempo', expected: 'PART_TIME' },
  { raw: 'Freelance', expected: 'CONTRACTOR' },
  { raw: 'Temporal', expected: 'TEMPORARY' },
  { raw: 'Pasantía', expected: 'INTERN' },
  { raw: 'Internship', expected: 'INTERN' },
  { raw: 'Voluntariado', expected: 'VOLUNTEER' },
  { raw: 'PART_TIME', expected: 'PART_TIME' },

  // These SHOULD return null (not a valid employmentType — never invent)
  { raw: 'Remoto', expected: null },             // modality, not employment type
  { raw: 'Beca', expected: null },               // scholarship
  { raw: 'JOB', expected: null },                // not a specific type
  { raw: 'Concurso Público', expected: null },    // not an employment type
  { raw: 'Publicación en foro', expected: null }, // forum post
  { raw: null, expected: null },
  { raw: '', expected: null },
  { raw: undefined, expected: null },
  { raw: 'unknown_value_xyz', expected: null },
]

let passed = 0
let failed = 0

console.log('\n═══ employmentType mapping validation ═══\n')

for (const { raw, expected } of KNOWN_SCRAPER_VALUES) {
  const result = map(raw)
  const ok = result === expected
  if (ok) {
    console.log(`  ✅  ${JSON.stringify(raw)} → ${result}`)
    passed++
  } else {
    console.log(`  ❌  ${JSON.stringify(raw)} → ${result} (expected ${expected})`)
    failed++
  }
}

console.log(`\n  ${passed} passed, ${failed} failed\n`)

if (failed > 0) {
  process.exit(1)
}

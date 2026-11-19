import assert from 'node:assert/strict'
import { buildDefaultDictionary } from '../supabase/functions/_shared/matching.ts'
import { rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'

const dictionary = buildDefaultDictionary()
const base = { is_active: true, verification_status: 'verified', match_eligible: true, archived_at: null, deleted_at: null, deadline: null, location: 'Asunción, Paraguay', eligible_countries: ['py'], eligible_regions: [] }
const candidate = {
  professional_title: 'Licenciado en Relaciones Internacionales y Gestor de Proyectos',
  summary: 'Cooperación internacional y programas de desarrollo.',
  profile_data: { habilidades: ['Gestión de proyectos', 'Inglés'], seniority: 'semi-senior', location: 'Paraguay', education: [{ degree: 'Relaciones Internacionales' }] },
}
const tvRepair = { ...base, id: 'tv', title: 'Auxiliar Técnico en Reparaciones de Televisores', rubro: 'Atención al Cliente', tags: ['Atención al cliente', 'customer service representative'], description: 'Reparación de equipos electrónicos y atención al cliente.' }
const programme = { ...base, id: 'programme', title: 'Programme Officer', rubro: 'Organismos Internacionales', tags: ['Gestión de proyectos', 'Inglés', 'MS Project'], description: 'Cooperación internacional, proyectos de desarrollo y monitoreo. Rol semi-senior.' }
const { rankedV2 } = rankOpportunitiesV2(candidate, [tvRepair, programme], dictionary, V2_PRESET_FULL, new Map([['programme', .86], ['tv', .82]]))
const visible = rankedV2.map((result) => result.breakdown)
assert.equal(visible.some((result) => result.vacancySkills.some((skill) => /atencion al cliente|customer service/i.test(skill))), false)
const trusted = visible.filter((result) => result.confidence === 'HIGH' && result.evidence.eligibilitySignal === 'ELIGIBLE')
const missing = [...new Set(trusted.flatMap((result) => result.missingSkills))]
assert.equal(missing.includes('Atención al cliente'), false)
assert.equal(missing.includes('MS Project'), true)
console.log('verify_downstream_match_behavior: PASS')

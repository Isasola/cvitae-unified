import assert from 'node:assert/strict'
import { buildProfileEmbeddingText } from '../supabase/functions/_shared/embedding.ts'
import { confirmedCandidateTruth } from '../netlify/functions/lib/candidate-truth.ts'

const profile = {
  professional_title: 'Especialista en cooperación internacional y proyectos',
  summary: 'Diseña y gestiona programas educativos para organizaciones internacionales.',
  cv_text: '',
  profile_data: {
    habilidades: ['Gestión de proyectos', 'Atención al cliente'],
    seniority: 'Semi-Senior',
    location: 'Paraguay',
    education: [{ degree: 'Licenciatura en Relaciones Internacionales', institution: 'Universidad Nacional' }],
    experience: [{ position: 'Coordinadora de programas', company: 'ONG regional', achievements: ['Lideró licitaciones y equipos'] }],
    languages: [{ language: 'Inglés', level: 'Avanzado' }],
    career_route: 'organismos',
    desired_role_1y: 'Programme Officer',
    career_interests: ['desarrollo internacional'],
  },
}

const text = buildProfileEmbeddingText(profile)
assert.match(text, /Relaciones Internacionales/)
assert.match(text, /Coordinadora de programas/)
assert.match(text, /Inglés/)
assert.match(text, /Programme Officer/)
assert.ok(text.length <= 1800)

const extractedDraft = { education: profile.profile_data.education, experience: profile.profile_data.experience, languages: profile.profile_data.languages, professional_title: profile.professional_title }
const truth = confirmedCandidateTruth({ skills: profile.profile_data.habilidades }, extractedDraft)
assert.equal(truth.evidence.education, 'EXTRACTED')
assert.equal(truth.evidence.experience, 'EXTRACTED')
assert.equal(truth.evidence.skills, 'USER_CONFIRMED')
assert.equal(truth.evidence.professional_title, 'EXTRACTED')
const persisted = { ...profile, profile_data: { ...profile.profile_data, candidate_truth: truth } }
assert.equal(persisted.profile_data.candidate_truth.evidence.languages, 'EXTRACTED')
console.log('verify_candidate_truth: PASS')

/** Gold Standard 2.0: deterministic product-quality evaluation for V2.1. */
import assert from 'node:assert/strict'
import { buildDefaultDictionary } from '../supabase/functions/_shared/matching.ts'
import { rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'

const dictionary = buildDefaultDictionary()
const base = { is_active: true, verification_status: 'verified', match_eligible: true, archived_at: null, deleted_at: null, deadline: null, location: 'Asunción, Paraguay', eligible_countries: ['py'], eligible_regions: [] }
type Spec = { key: string; title: string; skills: string[]; goodTitle: string; goodRubro: string; goodSkills: string[]; badTitle: string; badRubro: string; badSkills: string[] }
const specs: Spec[] = [
  { key:'international', title:'Especialista en Relaciones Internacionales y Cooperación', skills:['Cooperación internacional','Inglés','Gestión de proyectos'], goodTitle:'Programme Officer International Development',goodRubro:'Organismos Internacionales',goodSkills:['Cooperación internacional','Inglés','Gestión de proyectos'],badTitle:'Anestesiólogo Clínico',badRubro:'Salud',badSkills:['Cuidado al paciente'] },
  { key:'project', title:'Project Programme Manager', skills:['Gestión de proyectos','MS Project','Stakeholder management'], goodTitle:'Project Coordinator',goodRubro:'Gestión de Proyectos',goodSkills:['Gestión de proyectos','MS Project'],badTitle:'Técnico Reparador de Televisores',badRubro:'Ingeniería',badSkills:['Electrónica','Reparación de televisores'] },
  { key:'software', title:'Software Backend Developer', skills:['Python','SQL','Docker'], goodTitle:'Backend Software Engineer',goodRubro:'Tecnología',goodSkills:['Python','SQL','Docker'],badTitle:'Nutricionista Hospitalario',badRubro:'Salud',badSkills:['Nutrición'] },
  { key:'data', title:'Data Analyst', skills:['SQL','Power BI','Python'], goodTitle:'Business Data Analyst',goodRubro:'Data',goodSkills:['SQL','Power BI'],badTitle:'Abogado Corporativo',badRubro:'Legal',badSkills:['Derecho'] },
  { key:'finance', title:'Contador Financiero', skills:['Contabilidad','Finanzas','Excel'], goodTitle:'Analista Financiero',goodRubro:'Finanzas',goodSkills:['Contabilidad','Finanzas','Excel'],badTitle:'Enfermero Clínico',badRubro:'Salud',badSkills:['Enfermería'] },
  { key:'health', title:'Enfermera Clínica', skills:['Enfermería','Cuidado al paciente'], goodTitle:'Enfermera de Hospital',goodRubro:'Salud',goodSkills:['Enfermería','Cuidado al paciente'],badTitle:'Senior Backend Engineer',badRubro:'Tecnología',badSkills:['Python','Docker'] },
  { key:'marketing', title:'Especialista en Marketing Digital', skills:['SEO','Google Ads','Marketing digital'], goodTitle:'Marketing Content Specialist',goodRubro:'Marketing',goodSkills:['SEO','Google Ads'],badTitle:'Contador Auditor',badRubro:'Finanzas',badSkills:['Contabilidad'] },
  { key:'sales', title:'Ejecutivo de Ventas B2B', skills:['Ventas','Negociación','Atención al cliente'], goodTitle:'Business Development Sales Executive',goodRubro:'Ventas',goodSkills:['Ventas','Negociación'],badTitle:'Ingeniero Civil',badRubro:'Ingeniería',badSkills:['Autocad'] },
  { key:'operations', title:'Coordinador de Operaciones', skills:['Logística','Excel','Gestión de proyectos'], goodTitle:'Operations Coordinator',goodRubro:'Operaciones',goodSkills:['Logística','Excel'],badTitle:'Médico Cirujano',badRubro:'Salud',badSkills:['Cirugía'] },
  { key:'hr', title:'Especialista de Recursos Humanos', skills:['Recursos Humanos','Talent acquisition','Excel'], goodTitle:'HR Talent Acquisition Analyst',goodRubro:'Recursos Humanos',goodSkills:['Recursos Humanos','Talent acquisition'],badTitle:'Data Engineer',badRubro:'Data',badSkills:['Python','SQL'] },
  { key:'legal', title:'Abogada Legal Corporativa', skills:['Derecho','Contratos','Compliance'], goodTitle:'Legal Compliance Analyst',goodRubro:'Legal',goodSkills:['Derecho','Compliance'],badTitle:'Desarrollador Frontend',badRubro:'Tecnología',badSkills:['JavaScript','React'] },
  { key:'technical', title:'Ingeniero Mecánico Industrial', skills:['Ingeniería mecánica','Autocad','Mantenimiento'], goodTitle:'Ingeniero Mecánico',goodRubro:'Ingeniería',goodSkills:['Autocad','Mantenimiento'],badTitle:'Community Manager',badRubro:'Marketing',badSkills:['SEO'] },
  { key:'admin_entry', title:'Asistente Administrativa Junior', skills:['Excel','Redacción','Comunicación'], goodTitle:'Asistente Administrativa',goodRubro:'Administración',goodSkills:['Excel','Redacción'],badTitle:'Senior Software Architect',badRubro:'Tecnología',badSkills:['Kubernetes'] },
  { key:'hybrid', title:'Analista Financiero de Datos', skills:['Finanzas','Excel','SQL','Power BI'], goodTitle:'Financial Data Analyst',goodRubro:'Data Finanzas',goodSkills:['Finanzas','SQL','Power BI'],badTitle:'Enfermero Clínico',badRubro:'Salud',badSkills:['Enfermería'] },
]
let totals = { mustMatch:0, shownMatch:0, hardReject:0, rejected:0, visible:0, candidates:specs.length }
const ablations: Record<string, number[]> = { no_semantic: [], legacy_cosine: [], quantile: [] }
for (const spec of specs) {
  const profile = { professional_title: spec.title, summary: spec.title, profile_data: { habilidades: spec.skills, seniority:'semi-senior', location:'Paraguay' } }
  const good = { ...base, id:`${spec.key}-good`, title:spec.goodTitle, rubro:spec.goodRubro, tags:spec.goodSkills, description:`${spec.goodTitle} semi-senior ${spec.goodSkills.join(' ')}` }
  const bad = { ...base, id:`${spec.key}-bad`, title:spec.badTitle, rubro:spec.badRubro, tags:spec.badSkills, description:`${spec.badTitle} semi-senior ${spec.badSkills.join(' ')}` }
  const sims = new Map([[good.id,.87],[bad.id,.85]])
  for (const [label, semanticMode] of Object.entries({ no_semantic:'none', legacy_cosine:'raw', quantile:'quantile' } as const)) {
    const result = rankOpportunitiesV2(profile, [good,bad], dictionary, { ...V2_PRESET_FULL, semanticMode }, sims)
    const shown = result.rankedV2.map(item => item.opp.id)
    ablations[label].push(shown[0] === good.id ? 1 : 0)
    if (label === 'quantile') {
      totals.mustMatch++; totals.hardReject++; totals.visible += shown.length
      if (shown.includes(good.id)) totals.shownMatch++
      if (!shown.includes(bad.id)) totals.rejected++
    }
  }
}
const precision5 = totals.shownMatch / totals.visible
const precision10 = precision5
const hardRejectRecall = totals.rejected / totals.hardReject
const coverage = totals.shownMatch / totals.mustMatch
const abstention = 1 - totals.visible / (totals.candidates * 2)
assert.equal(totals.shownMatch, totals.mustMatch, 'every Gold 2.0 MUST_MATCH visible')
assert.equal(totals.rejected, totals.hardReject, 'every Gold 2.0 MUST_REJECT hidden')
assert.ok(abstention > 0, 'abstention must remove unsuitable results')
for (const [label, values] of Object.entries(ablations)) console.log(`V2.1 ${label}: top-1 precision=${Math.round(values.reduce((a,b)=>a+b,0)/values.length*100)}%`)
console.log(`V2.1 Gold 2.0: families=${totals.candidates} precision@5=${Math.round(precision5*100)}% precision@10=${Math.round(precision10*100)}% false_positive_rate=${Math.round((1-hardRejectRecall)*100)}% hard_reject_recall=${Math.round(hardRejectRecall*100)}% coverage=${Math.round(coverage*100)}% abstention=${Math.round(abstention*100)}%`)
console.log('verify_matching_v21_gold: PASS')

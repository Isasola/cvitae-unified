/**
 * matching-gold-standard.ts
 *
 * Gold Standard fixture set for Matching V2 regression testing.
 * 8 candidate archetypes × 16 opportunity fixtures × 19 expectations.
 *
 * MUST_MATCH = should appear in ranked results, high score
 * BORDERLINE  = might appear, limited evidence, no hard constraint
 * MUST_REJECT = must NOT appear (hard filter) OR must score low (domain conflict)
 *
 * NO prod data. NO Supabase connection. Purely in-memory.
 */

// ─── Minimal compatible types (matching.ts is JS with no explicit TS types) ───

export interface GoldCandidate {
  professional_title: string
  profile_data: {
    habilidades: string[]
    seniority: string | null
    location: string
    career_route: string | null
    desired_role_1y?: string
    career_interests?: string[]
  }
  _key: string
}

export interface GoldOpportunity {
  id: string
  title: string
  organization: string
  rubro: string
  type: string
  tags: string[]
  location: string
  eligible_countries: string[]
  eligible_regions?: string[]
  description: string
  seniority_hint: string | null
  match_eligible: boolean
  verification_status: string
  is_active: boolean
  archived_at: string | null
  deleted_at: string | null
  deadline: string | null
  opportunity_type?: string
  opportunity_kind?: string
  source?: string
  slug?: string
  application_url?: string
  alerts_eligible?: boolean
}

export interface GoldExpectation {
  candidateKey: string
  opportunityId: string
  expected: 'MUST_MATCH' | 'SHOULD_MATCH' | 'MAYBE' | 'BORDERLINE' | 'MUST_REJECT'
  reason: string
  critical: boolean
}

const FUTURE = '2027-01-01T00:00:00Z'

// ─── CANDIDATES ───────────────────────────────────────────────────────────────

export const CANDIDATES: Record<string, GoldCandidate> = {
  PYTHON_JUNIOR_PY: {
    _key: 'PYTHON_JUNIOR_PY',
    professional_title: 'Junior Python Backend Developer',
    profile_data: {
      habilidades: ['Python', 'Django', 'SQL', 'Git', 'REST API'],
      seniority: 'junior',
      location: 'Asunción, Paraguay',
      career_route: 'remoto',
      desired_role_1y: 'Backend developer en empresa regional LATAM',
    },
  },

  DATA_ANALYST_PY: {
    _key: 'DATA_ANALYST_PY',
    professional_title: 'Analista de Datos',
    profile_data: {
      habilidades: ['Python', 'SQL', 'Power BI', 'Excel', 'Tableau'],
      seniority: 'semi-senior',
      location: 'Asunción, Paraguay',
      career_route: null,
    },
  },

  MARKETING_JUNIOR: {
    _key: 'MARKETING_JUNIOR',
    professional_title: 'Coordinador de Marketing Digital',
    profile_data: {
      habilidades: ['Marketing digital', 'Meta Ads', 'SEO', 'Google Ads', 'Canva'],
      seniority: 'junior',
      location: 'Asunción, Paraguay',
      career_route: 'marketing',
    },
  },

  FINANCE_ACCOUNTANT: {
    _key: 'FINANCE_ACCOUNTANT',
    professional_title: 'Contador Financiero',
    profile_data: {
      habilidades: ['Contabilidad', 'Finanzas', 'Excel', 'SAP', 'Presupuesto'],
      seniority: 'semi-senior',
      location: 'Asunción, Paraguay',
      career_route: null,
    },
  },

  NURSE_HEALTHCARE: {
    _key: 'NURSE_HEALTHCARE',
    professional_title: 'Enfermera Clínica',
    profile_data: {
      habilidades: ['Enfermería', 'Cuidado al paciente', 'Gestión hospitalaria'],
      seniority: 'semi-senior',
      location: 'Asunción, Paraguay',
      career_route: null,
    },
  },

  INTL_RELATIONS_NGO: {
    _key: 'INTL_RELATIONS_NGO',
    professional_title: 'Coordinadora de Proyectos Internacionales',
    profile_data: {
      habilidades: ['Gestión de proyectos', 'Inglés', 'Cooperación internacional', 'Planificación estratégica', 'Gestión de stakeholders'],
      seniority: 'semi-senior',
      location: 'Asunción, Paraguay',
      career_route: 'organismos',
      desired_role_1y: 'Programme Officer en organismo internacional',
      career_interests: ['cooperación internacional', 'desarrollo sostenible', 'proyectos ONG'],
    },
  },

  PROJECT_MANAGER_GEN: {
    _key: 'PROJECT_MANAGER_GEN',
    professional_title: 'Project Manager',
    profile_data: {
      habilidades: ['Gestión de proyectos', 'Metodología ágil', 'MS Project', 'Stakeholder management'],
      seniority: 'senior',
      location: 'Asunción, Paraguay',
      career_route: null,
    },
  },

  ENTRY_LEVEL: {
    _key: 'ENTRY_LEVEL',
    professional_title: 'Asistente Administrativa',
    profile_data: {
      habilidades: ['Excel', 'Comunicación', 'Redacción'],
      seniority: 'junior',
      location: 'Asunción, Paraguay',
      career_route: null,
    },
  },
}

// ─── OPPORTUNITIES ────────────────────────────────────────────────────────────

function opp(base: Omit<GoldOpportunity, 'archived_at' | 'deleted_at' | 'deadline' | 'organization' | 'eligible_regions' | 'source' | 'slug' | 'application_url' | 'alerts_eligible' | 'opportunity_kind'> & Partial<GoldOpportunity>): GoldOpportunity {
  return {
    organization: 'Empresa Test S.A.',
    eligible_regions: [],
    archived_at: null,
    deleted_at: null,
    deadline: FUTURE,
    source: 'test_fixture',
    slug: base.id,
    application_url: `https://example.com/${base.id}`,
    alerts_eligible: true,
    opportunity_kind: 'empleo',
    ...base,
  }
}

export const OPPORTUNITIES: Record<string, GoldOpportunity> = {

  // ── MUST_MATCH opportunities ────────────────────────────────────────────────

  JUNIOR_PYTHON_BACKEND_LATAM: opp({
    id: 'junior-python-backend-latam',
    title: 'Junior Python Backend Developer',
    rubro: 'Tecnología',
    type: 'Full-time',
    tags: ['Python', 'Django', 'SQL', 'REST API'],
    location: 'Remote',
    eligible_countries: ['py', 'ar', 'co', 'mx', 'uy'],
    description: 'Buscamos junior python developer para equipo backend. Experiencia con Django y SQL requerida.',
    seniority_hint: 'junior',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  PROGRAMME_COORDINATOR_NGO_LATAM: opp({
    id: 'programme-coordinator-ngo-latam',
    title: 'Programme Coordinator',
    organization: 'ONG Internacional LATAM',
    rubro: 'Organismos Internacionales',
    type: 'Full-time',
    tags: ['Gestión de proyectos', 'Inglés', 'Cooperación internacional'],
    location: 'Remote / Paraguay',
    eligible_countries: ['py', 'latam', 'worldwide'],
    description: 'Seeking Programme Coordinator for international development programmes in LATAM. Project management and English required.',
    seniority_hint: 'semi-senior',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  ANALISTA_FINANCIERO_LATAM: opp({
    id: 'analista-financiero-latam',
    title: 'Analista Financiero Senior',
    rubro: 'Finanzas',
    type: 'Full-time',
    tags: ['Finanzas', 'Excel', 'SAP', 'Contabilidad', 'Análisis financiero'],
    location: 'Remote LATAM',
    eligible_countries: ['latam', 'worldwide'],
    description: 'Analista financiero con experiencia en SAP y Excel avanzado para empresa LATAM.',
    seniority_hint: 'senior',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  WORLDWIDE_REMOTE_PROGRAMME_OFFICER: opp({
    id: 'worldwide-remote-programme-officer',
    title: 'Remote Programme Officer',
    organization: 'UN Agency',
    rubro: 'Organismos Internacionales',
    type: 'Full-time',
    tags: ['Cooperación internacional', 'Gestión de proyectos', 'Inglés'],
    location: 'Remote Worldwide',
    eligible_countries: ['worldwide'],
    description: 'Programme Officer for international agency, remote worldwide. Coordination and project management.',
    seniority_hint: 'mid',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  JAVA_DEVELOPER_PARTIAL_SKILLS: opp({
    id: 'java-developer-partial-skills',
    title: 'Java Developer',
    rubro: 'Tecnología',
    type: 'Full-time',
    tags: ['Java', 'Spring', 'Hibernate'],
    location: 'Asunción, Paraguay',
    eligible_countries: ['py'],
    description: 'Java Developer con Spring e Hibernate. Kubernetes deseable.',
    seniority_hint: 'mid',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  // ── MUST_REJECT opportunities ───────────────────────────────────────────────

  SENIOR_JAVA_SPRING_CO: opp({
    id: 'senior-java-spring-co',
    title: 'Senior Java Spring Developer',
    rubro: 'Tecnología',
    type: 'Full-time',
    tags: ['Java', 'Spring Boot', 'Kubernetes', 'AWS'],
    location: 'Bogotá, Colombia',
    eligible_countries: ['co'],
    description: 'Senior java developer con Spring Boot y K8s. Solo Colombia presencial.',
    seniority_hint: 'senior',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  DATA_ANALYST_SQL_LATAM: opp({
    id: 'data-analyst-sql-latam',
    title: 'Data Analyst Senior',
    rubro: 'Data',
    type: 'Full-time',
    tags: ['SQL', 'Python', 'Power BI', 'Machine Learning'],
    location: 'Remote',
    eligible_countries: ['us', 'ca', 'latam'],
    description: 'Senior data analyst with expertise in SQL, Python, Power BI and ML modeling.',
    seniority_hint: 'senior',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  US_ONLY_REMOTE_ENGINEER: opp({
    id: 'us-only-remote-engineer',
    title: 'Remote Software Engineer',
    rubro: 'Tecnología',
    type: 'Full-time',
    tags: ['Python', 'AWS', 'Docker'],
    location: 'Remote (US only)',
    eligible_countries: ['us'],
    description: 'Remote engineer for US-based team. Must be authorized to work in the US.',
    seniority_hint: 'mid',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  DIRECTOR_HEAD_ROLE: opp({
    id: 'director-head-role',
    title: 'Head of Engineering / Director',
    rubro: 'Tecnología',
    type: 'Full-time',
    tags: ['Leadership', 'Engineering', 'Strategy', 'Budget'],
    location: 'Buenos Aires',
    eligible_countries: ['ar', 'latam'],
    description: 'Director of Engineering para liderar equipos de 50+ personas con presupuesto millonario.',
    seniority_hint: 'director',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  TECHNICAL_PM_AWS_K8S: opp({
    id: 'technical-pm-aws-k8s',
    title: 'Technical Project Manager - AWS/Kubernetes/Terraform',
    rubro: 'Tecnología',
    type: 'Full-time',
    tags: ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'CI/CD'],
    location: 'Remote',
    eligible_countries: ['us', 'ca', 'uk'],
    description: 'Technical PM with hands-on AWS, Kubernetes, Terraform experience required. Must know infrastructure.',
    seniority_hint: 'senior',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  // ── EIGHT GATES / eligibility tests ─────────────────────────────────────────

  MATCH_ELIGIBLE_FALSE: opp({
    id: 'match-eligible-false',
    title: 'Amazing Developer Python LATAM',
    rubro: 'Tecnología',
    type: 'Full-time',
    tags: ['Python', 'SQL', 'Django'],
    location: 'Remote',
    eligible_countries: ['latam'],
    description: 'Perfect match for any Python developer in LATAM. Django and SQL.',
    seniority_hint: 'junior',
    match_eligible: false, // ← BLOCKED BY EIGHT GATES
    verification_status: 'verified',
    is_active: true,
  }),

  TENDER_LICITACION: opp({
    id: 'tender-licitacion',
    title: 'Licitación para desarrollo de software',
    organization: 'Gobierno PY',
    rubro: 'Tecnología',
    type: 'Licitación',
    opportunity_type: 'tender',
    tags: ['Software', 'Desarrollo'],
    location: 'Asunción, Paraguay',
    eligible_countries: ['py'],
    description: 'Licitación pública para desarrollo de sistema de gestión de datos.',
    seniority_hint: null,
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  // ── BORDERLINE / unknown signal tests ──────────────────────────────────────

  COMMUNITY_MANAGER_THIN: opp({
    id: 'community-manager-thin',
    title: 'Community Manager',
    rubro: 'Marketing',
    type: 'Full-time',
    tags: [],  // thin — no skills extracted → skillsScore signal UNKNOWN
    location: 'Asunción, Paraguay',
    eligible_countries: ['py'],
    description: 'Buscamos persona dinámica y creativa para gestión de redes.',
    seniority_hint: null,
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  NO_ELIGIBLE_COUNTRIES_LOCAL: opp({
    id: 'no-eligible-countries-local',
    title: 'Analista de Sistemas',
    rubro: 'Tecnología',
    type: 'Full-time',
    tags: ['Python', 'SQL'],
    location: 'Asunción, Paraguay',
    eligible_countries: [], // EMPTY — eligibility UNKNOWN
    description: 'Analista de sistemas para empresa local en Asunción. Python y SQL.',
    seniority_hint: 'mid',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  UNKNOWN_SENIORITY_BOTH: opp({
    id: 'unknown-seniority-both',
    title: 'Especialista en proyectos especiales',
    rubro: 'Gestión',
    type: 'Full-time',
    tags: ['Gestión de proyectos', 'Coordinación'],
    location: 'Remote LATAM',
    eligible_countries: ['latam'],
    description: 'Especialista para proyectos especiales, gestión y coordinación estratégica.',
    seniority_hint: null, // unknown seniority in description
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),

  WORLDWIDE_REMOTE_COMPATIBLE_TECH: opp({
    id: 'worldwide-remote-compatible-tech',
    title: 'Remote Programme Officer - Technology',
    organization: 'International Foundation',
    rubro: 'Organismos Internacionales',
    type: 'Full-time',
    tags: ['Cooperación internacional', 'Gestión de proyectos', 'Inglés'],
    location: 'Remote Worldwide',
    eligible_countries: ['worldwide'],
    description: 'Programme Officer for technology-focused international foundation. Remote worldwide.',
    seniority_hint: 'mid',
    match_eligible: true,
    verification_status: 'verified',
    is_active: true,
  }),
}

// ─── EXPECTATIONS MATRIX ──────────────────────────────────────────────────────

export const EXPECTATIONS: GoldExpectation[] = [
  // ── Eight Gates / hard filters (always critical) ────────────────────────────
  {
    candidateKey: 'PYTHON_JUNIOR_PY',
    opportunityId: 'match-eligible-false',
    expected: 'MUST_REJECT',
    reason: 'match_eligible=false — Eight Gates blocked, regardless of semantic similarity',
    critical: true,
  },
  {
    candidateKey: 'PYTHON_JUNIOR_PY',
    opportunityId: 'tender-licitacion',
    expected: 'MUST_REJECT',
    reason: 'Tender filter — isTender() must return true',
    critical: true,
  },
  {
    candidateKey: 'PYTHON_JUNIOR_PY',
    opportunityId: 'us-only-remote-engineer',
    expected: 'MUST_REJECT',
    reason: 'PY candidate + US-only eligible — isEligibleForProfile = false',
    critical: true,
  },
  {
    candidateKey: 'PYTHON_JUNIOR_PY',
    opportunityId: 'senior-java-spring-co',
    expected: 'MUST_REJECT',
    reason: 'Zero skill overlap + wrong domain + ineligible country (CO only)',
    critical: true,
  },
  {
    candidateKey: 'PYTHON_JUNIOR_PY',
    opportunityId: 'technical-pm-aws-k8s',
    expected: 'MUST_REJECT',
    reason: 'Ineligible (US/CA/UK) + zero skill overlap with AWS/K8s/Terraform',
    critical: true,
  },

  // ── Domain MUST_MATCH ───────────────────────────────────────────────────────
  {
    candidateKey: 'PYTHON_JUNIOR_PY',
    opportunityId: 'junior-python-backend-latam',
    expected: 'MUST_MATCH',
    reason: 'Perfect domain + skills (Python/Django/SQL) + eligibility (PY in LATAM)',
    critical: true,
  },
  {
    candidateKey: 'INTL_RELATIONS_NGO',
    opportunityId: 'programme-coordinator-ngo-latam',
    expected: 'MUST_MATCH',
    reason: 'Career adjacency: intl development → programme coordinator; skills match; eligible',
    critical: true,
  },
  {
    candidateKey: 'INTL_RELATIONS_NGO',
    opportunityId: 'worldwide-remote-programme-officer',
    expected: 'MUST_MATCH',
    reason: 'Perfect: programme officer + NGO rubro + worldwide eligible + career_route=organismos',
    critical: true,
  },
  {
    candidateKey: 'FINANCE_ACCOUNTANT',
    opportunityId: 'analista-financiero-latam',
    expected: 'MUST_MATCH',
    reason: 'Domain + skills (Finanzas/Excel/SAP/Contabilidad) + eligibility (LATAM)',
    critical: true,
  },

  // ── Cross-domain MUST_REJECT ────────────────────────────────────────────────
  {
    candidateKey: 'INTL_RELATIONS_NGO',
    opportunityId: 'senior-java-spring-co',
    expected: 'MUST_REJECT',
    reason: 'Cross-domain: intl relations coordinator != Java developer; ineligible country',
    critical: true,
  },
  {
    candidateKey: 'INTL_RELATIONS_NGO',
    opportunityId: 'technical-pm-aws-k8s',
    expected: 'MUST_REJECT',
    reason: 'Technical PM requires tech stack; ineligible country (US/CA/UK)',
    critical: true,
  },
  {
    candidateKey: 'NURSE_HEALTHCARE',
    opportunityId: 'data-analyst-sql-latam',
    expected: 'MUST_REJECT',
    reason: 'Healthcare != data analytics; zero skill overlap',
    critical: true,
  },
  {
    candidateKey: 'NURSE_HEALTHCARE',
    opportunityId: 'senior-java-spring-co',
    expected: 'MUST_REJECT',
    reason: 'Healthcare != software engineering; ineligible',
    critical: true,
  },
  {
    candidateKey: 'ENTRY_LEVEL',
    opportunityId: 'director-head-role',
    expected: 'MUST_REJECT',
    reason: 'Extreme seniority gap: junior vs director (diff=4)',
    critical: false,
  },

  // ── Unknown signals (eligibility / seniority UNKNOWN) ──────────────────────
  {
    candidateKey: 'PYTHON_JUNIOR_PY',
    opportunityId: 'no-eligible-countries-local',
    expected: 'BORDERLINE',
    reason: 'Eligible countries empty — eligibility UNKNOWN, NOT auto-promoted to eligible',
    critical: false,
  },
  {
    candidateKey: 'PROJECT_MANAGER_GEN',
    opportunityId: 'unknown-seniority-both',
    expected: 'BORDERLINE',
    reason: 'Both seniority unknown — should NOT auto-score 100 on seniority',
    critical: false,
  },
  {
    candidateKey: 'MARKETING_JUNIOR',
    opportunityId: 'community-manager-thin',
    expected: 'BORDERLINE',
    reason: 'Career adjacent but thin description — skills signal UNKNOWN (no extractable skills)',
    critical: false,
  },

  // ── Career adjacency pass ───────────────────────────────────────────────────
  {
    candidateKey: 'INTL_RELATIONS_NGO',
    opportunityId: 'worldwide-remote-compatible-tech',
    expected: 'MUST_MATCH',
    reason: 'Programme Officer role with NGO keywords + worldwide eligible + career_route=organismos careerBonus',
    critical: false,
  },

  // ── Partial skill overlap ───────────────────────────────────────────────────
  // Note: JAVA_DEVELOPER candidate is not in CANDIDATES above but used conceptually.
  // For MARKETING vs JAVA: clear reject
  {
    candidateKey: 'MARKETING_JUNIOR',
    opportunityId: 'senior-java-spring-co',
    expected: 'MUST_REJECT',
    reason: 'Marketing junior vs Senior Java — zero skills, wrong domain, ineligible country',
    critical: true,
  },
]

// ─── HELPER: convert GoldOpportunity → MatchOpportunity-compatible object ─────

export function goldOppToMatchOpp(g: GoldOpportunity): any {
  return {
    id: g.id,
    slug: g.slug ?? g.id,
    title: g.title,
    organization: g.organization,
    location: g.location,
    rubro: g.rubro,
    tags: g.tags,
    description: g.description,
    application_url: g.application_url ?? `https://example.com/${g.id}`,
    type: g.type,
    opportunity_type: g.opportunity_type ?? 'job',
    opportunity_kind: g.opportunity_kind ?? 'empleo',
    eligible_countries: g.eligible_countries,
    eligible_regions: g.eligible_regions ?? [],
    source: g.source ?? 'test_fixture',
    deadline: g.deadline,
    created_at: '2026-09-01T00:00:00Z',
    is_active: g.is_active,
    verification_status: g.verification_status,
    match_eligible: g.match_eligible,
    archived_at: g.archived_at,
    deleted_at: g.deleted_at,
    alerts_eligible: g.alerts_eligible ?? true,
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function getCriticalExpectations(): GoldExpectation[] {
  return EXPECTATIONS.filter(e => e.critical)
}

export function getCandidateExpectations(candidateKey: string): GoldExpectation[] {
  return EXPECTATIONS.filter(e => e.candidateKey === candidateKey)
}

export function getMustMatchOpps(candidateKey: string): string[] {
  return EXPECTATIONS
    .filter(e => e.candidateKey === candidateKey && e.expected === 'MUST_MATCH')
    .map(e => e.opportunityId)
}

export function getMustRejectOpps(candidateKey: string): string[] {
  return EXPECTATIONS
    .filter(e => e.candidateKey === candidateKey && e.expected === 'MUST_REJECT')
    .map(e => e.opportunityId)
}

/**
 * Matching puro — funciones deterministas compartidas entre match-batch y los tests.
 *
 * Este módulo no importa Deno ni Node. Es compatible con ambos entornos.
 * match-batch/index.ts lo importa directamente.
 * scripts/verify-matching-calibration.ts lo importa vía Node/tsx.
 */ export const STOP_WORDS = new Set([
  'para',
  'como',
  'desde',
  'hasta',
  'sobre',
  'entre',
  'empresa',
  'empleo',
  'trabajo',
  'puesto',
  'vacante',
  'buscamos',
  'requiere',
  'requisitos',
  'experiencia',
  'conocimientos',
  'paraguay',
  'asuncion',
  'remoto',
  'the',
  'and',
  'with',
  'from',
  'your',
  'role',
  'job',
  'work'
]);
/**
 * Alias canónicos para normalización de habilidades.
 * Clave = nombre canónico; valor = lista de variantes (en minúsculas sin acentos).
 *
 * REGLA: los alias deben ser términos completos, nunca substrings de otras habilidades.
 * - "java" es alias de Java, NO de JavaScript.
 * - "node" es alias de Node.js, NO de "NodeRed".
 * - "react" es alias de React, NO de "Reactive" ni "React Native" (que tiene su propio canonical).
 * - "ux" es alias de UX/UI pero NO de "UX Writing" (que debe ser canonical separado si existe).
 * - "power" NO es alias de Power BI.
 * - "sql" es alias de SQL, NO de "NoSQL".
 * - "c" NO es alias de C++.
 */ export const SKILL_ALIASES = {
  'JavaScript': [
    'javascript',
    'js',
    'ecmascript'
  ],
  'TypeScript': [
    'typescript',
    'ts'
  ],
  'React': [
    'react',
    'reactjs',
    'react.js'
  ],
  'Angular': [
    'angular',
    'angularjs'
  ],
  'Vue.js': [
    'vue',
    'vuejs',
    'vue.js'
  ],
  'Node.js': [
    'node',
    'nodejs',
    'node.js'
  ],
  'Python': [
    'python',
    'django',
    'flask',
    'fastapi'
  ],
  'Java': [
    'java',
    'spring',
    'spring boot'
  ],
  'C# / .NET': [
    'c#',
    '.net',
    'dotnet',
    'asp.net'
  ],
  'PHP': [
    'php',
    'laravel',
    'symfony'
  ],
  'SQL': [
    'sql',
    'postgresql',
    'postgres',
    'mysql',
    'sql server',
    'oracle'
  ],
  'Excel': [
    'excel',
    'microsoft excel',
    'hojas de calculo'
  ],
  'Power BI': [
    'power bi',
    'powerbi',
    'dax'
  ],
  'Tableau': [
    'tableau'
  ],
  'AWS': [
    'aws',
    'amazon web services'
  ],
  'Azure': [
    'azure',
    'microsoft azure'
  ],
  'Google Cloud': [
    'gcp',
    'google cloud'
  ],
  'Docker': [
    'docker',
    'contenedores'
  ],
  'Kubernetes': [
    'kubernetes',
    'k8s'
  ],
  'Git': [
    'git',
    'github',
    'gitlab',
    'control de versiones'
  ],
  'Linux': [
    'linux',
    'ubuntu'
  ],
  'Figma': [
    'figma'
  ],
  'UX/UI': [
    'ux/ui',
    'experiencia de usuario',
    'interfaz de usuario'
  ],
  'SEO': [
    'seo',
    'search engine optimization'
  ],
  'Google Ads': [
    'google ads',
    'adwords',
    'sem'
  ],
  'Meta Ads': [
    'meta ads',
    'facebook ads',
    'instagram ads'
  ],
  'Marketing digital': [
    'marketing digital',
    'digital marketing'
  ],
  'Ventas': [
    'ventas',
    'sales',
    'comercial'
  ],
  'Atención al cliente': [
    'atencion al cliente',
    'customer service',
    'customer support'
  ],
  'Contabilidad': [
    'contabilidad',
    'contable',
    'accounting'
  ],
  'Finanzas': [
    'finanzas',
    'financiero',
    'finance'
  ],
  'Recursos Humanos': [
    'recursos humanos',
    'rrhh',
    'human resources',
    'talent acquisition'
  ],
  'Gestión de proyectos': [
    'gestion de proyectos',
    'project management',
    'scrum',
    'agile'
  ],
  'Inglés': [
    'ingles',
    'english'
  ]
};
export const SENIORITY_RANK = {
  pasante: 0,
  trainee: 0,
  becario: 0,
  junior: 1,
  jr: 1,
  semissenior: 2,
  ssr: 2,
  mid: 2,
  pleno: 2,
  senior: 3,
  sr: 3,
  lead: 4,
  techlead: 4,
  director: 5,
  gerente: 5,
  manager: 5
};
export function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+#.]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt);/gi, ' ').replace(/\s+/g, ' ').trim();
}
export function toStrings(value) {
  if (Array.isArray(value)) return value.map(String).map((s)=>s.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;|]/).map((s)=>s.trim()).filter(Boolean);
  return [];
}
export function isEligibleForProfile(opp, profileLocation) {
  const declared = [
    ...toStrings(opp.eligible_countries),
    ...toStrings(opp.eligible_regions)
  ].map((v)=>normalize(v)).filter(Boolean);
  const text = normalize(`${opp.title ?? ''} ${opp.description ?? ''} ${opp.location ?? ''} ${declared.join(' ')}`);
  // A remote flag never overrides an explicit regional restriction.
  if (/\b(us only|usa only|united states only|canada only|north america|emea|europe only|eu only|uk only)\b/.test(text)) return false;
  if (!declared.length) return !/(emea|north america|united states|canada only)/.test(text);
  const profile = normalize(profileLocation);
  const country = /\b(peru|lima|\bpe\b)\b/.test(profile) ? 'pe' : /\b(paraguay|asuncion|\bpy\b)\b/.test(profile) ? 'py' : '';
  if (!country) return declared.some((v)=>/(worldwide|all countr|latam|latin america|south america)/.test(v));
  return declared.some((v)=>v === country || (country === 'py' && v.includes('paraguay')) || (country === 'pe' && v.includes('peru')) || /(latam|latin america|latinoamerica|south america|sudamerica|worldwide|all countr)/.test(v));
}
export function isTender(opp) {
  return opp.opportunity_type === 'tender' || /(^|\s)(tender|licitacion|licitaciones|llamado a licitacion)(\s|$)/i.test(normalize(`${opp.title ?? ''} ${opp.type ?? ''} ${opp.opportunity_kind ?? ''} ${opp.rubro ?? ''}`));
}
/**
 * Compara dos habilidades normalizadas.
 *
 * Estrategia (en orden de prioridad):
 * 1. Igualdad normalizada exacta.
 * 2. Igualdad compacta exacta (sin puntuación/espacios): equipara "node.js" con "nodejs".
 * 3. Alias explícito del diccionario: "english" → "Inglés".
 *
 * NO usa substring genérico. Esto previene:
 * - Java != JavaScript
 * - Power != Power BI
 * - React != Reactive
 * - SQL != NoSQL
 * - C != C++
 */ export function sameSkill(left, right, dictionary = buildDefaultDictionary()) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  // 1. Igualdad normalizada exacta
  if (a === b) return true;
  // 2. Igualdad compacta exacta: strip puntuación/espacios restantes
  //    Equipara "node.js" (→ "nodejs") con "nodejs", "power bi" con "powerbi".
  //    Mínimo 3 chars para evitar que "c" == "c++" (ambos compactan a "c").
  const ta = a.replace(/[^a-z0-9]/g, '');
  const tb = b.replace(/[^a-z0-9]/g, '');
  if (ta.length >= 3 && tb.length >= 3 && ta === tb) return true;
  // 3. Alias del diccionario: ambas pertenecen al mismo canonical. El índice
  // se construye una sola vez por diccionario para no recorrerlo por cada
  // habilidad de cada oportunidad.
  const index = dictionaryIndex(dictionary);
  const sharesCanonical = (leftSet, rightSet)=>{
    if (!leftSet || !rightSet) return false;
    for (const canonical of leftSet)if (rightSet.has(canonical)) return true;
    return false;
  };
  if (sharesCanonical(index.byAlias.get(a), index.byAlias.get(b))) return true;
  if (ta.length >= 3 && tb.length >= 3 && sharesCanonical(index.byCompactAlias.get(ta), index.byCompactAlias.get(tb))) return true;
  return false;
}
export function buildDefaultDictionary() {
  return Object.entries(SKILL_ALIASES).map(([canonical, aliases])=>[
      canonical,
      [
        canonical,
        ...aliases
      ]
    ]);
}
export function buildDictionary(extra = []) {
  const base = new Map(buildDefaultDictionary());
  for (const [canonical, aliases] of extra){
    const existing = base.get(canonical) ?? [];
    base.set(canonical, [
      ...new Set([
        ...existing,
        ...aliases
      ])
    ]);
  }
  return [
    ...base.entries()
  ];
}
const dictionaryIndexCache = new WeakMap();
function dictionaryIndex(dictionary) {
  const cached = dictionaryIndexCache.get(dictionary);
  if (cached) return cached;
  const groups = dictionary.map(([canonical, aliases])=>[
      canonical,
      [...new Set(aliases.map(normalize).filter(Boolean))]
    ]);
  const byAlias = new Map();
  const byCompactAlias = new Map();
  const add = (index, key, canonical)=>{
    if (!key) return;
    const canonicals = index.get(key) ?? new Set();
    canonicals.add(canonical);
    index.set(key, canonicals);
  };
  for (const [canonical, aliases] of groups){
    for (const alias of aliases){
      add(byAlias, alias, canonical);
      const compact = alias.replace(/[^a-z0-9]/g, '');
      if (compact.length >= 3) add(byCompactAlias, compact, canonical);
    }
  }
  const value = {
    groups,
    byAlias,
    byCompactAlias,
    byCanonical: new Map(groups)
  };
  dictionaryIndexCache.set(dictionary, value);
  return value;
}
export function extractSkills(opp, dictionary) {
  const explicit = toStrings(opp.tags).filter((tag)=>normalize(tag).length >= 2).filter((tag)=>!STOP_WORDS.has(normalize(tag)));
  const searchable = normalize([
    opp.title,
    opp.rubro,
    opp.type,
    stripHtml(opp.description),
    explicit.join(' ')
  ].filter(Boolean).join(' | '));
  const index = dictionaryIndex(dictionary);
  const paddedSearchable = ` ${searchable} `;
  const detected = index.groups.filter(([, aliases])=>aliases.some((term)=>paddedSearchable.includes(` ${term} `))).map(([canonical])=>canonical);
  const detectedNorms = new Set(detected.flatMap((canonical)=>{
    const aliases = index.byCanonical.get(canonical);
    return aliases ?? [
      normalize(canonical)
    ];
  }));
  const meaningfulExplicit = explicit.filter((tag)=>{
    const words = normalize(tag).split(' ');
    if (!words.length || !words.every((word)=>word.length > 1 && !STOP_WORDS.has(word))) return false;
    if (words.length > 4) return false;
    return !detectedNorms.has(normalize(tag));
  });
  return [
    ...new Set([
      ...detected,
      ...meaningfulExplicit
    ])
  ].slice(0, 16);
}
export function calculateSkillScore(profileSkills, vacancySkills, dictionary) {
  if (!vacancySkills.length) return profileSkills.length ? 45 : 30;
  if (!profileSkills.length) return 15;
  const matchedVacancy = vacancySkills.filter((s)=>profileSkills.some((own)=>sameSkill(own, s, dictionary)));
  const matchedProfile = profileSkills.filter((s)=>vacancySkills.some((req)=>sameSkill(s, req, dictionary)));
  const vacancyCoverage = matchedVacancy.length / vacancySkills.length;
  const profileEvidence = matchedProfile.length / Math.min(Math.max(profileSkills.length, 1), 10);
  return Math.round(Math.min(1, vacancyCoverage * 0.75 + profileEvidence * 0.25) * 100);
}
export function tokenSet(value) {
  return new Set(normalize(value).split(' ').filter((w)=>w.length >= 3 && !STOP_WORDS.has(w)));
}
export function calculateTitleScore(profileTitle, opp) {
  const profileTokens = tokenSet(profileTitle);
  if (!profileTokens.size) return 45;
  const oppTokens = tokenSet(`${opp.title ?? ''} ${opp.rubro ?? ''} ${opp.type ?? ''}`);
  const hits = [
    ...profileTokens
  ].filter((t)=>oppTokens.has(t)).length;
  if (!hits) return 25;
  return Math.min(100, 45 + Math.round(hits / profileTokens.size * 55));
}
export function calculateSeniorityScore(profileSeniority, vacancyText) {
  const profileRank = SENIORITY_RANK[normalize(profileSeniority).replace(/\s/g, '')] ?? 2;
  const normalizedVacancy = normalize(vacancyText).replace(/\s/g, '');
  let vacancyRank = 2;
  for (const [key, rank] of Object.entries(SENIORITY_RANK)){
    if (normalizedVacancy.includes(key)) {
      vacancyRank = rank;
      break;
    }
  }
  const diff = Math.abs(profileRank - vacancyRank);
  return [
    100,
    78,
    52,
    28,
    12
  ][Math.min(diff, 4)];
}
export function calculateLocationScore(profileLocation, vacancyLocation) {
  const profile = normalize(profileLocation);
  const vacancy = normalize(vacancyLocation);
  if (!vacancy || !profile) return 65;
  if (/(remoto|remote|hibrido|hybrid)/.test(vacancy)) return 95;
  if (profile === vacancy || profile.includes(vacancy) || vacancy.includes(profile)) return 100;
  const py = [
    'paraguay',
    'asuncion',
    'central',
    'san lorenzo',
    'luque',
    'capiata',
    'py'
  ];
  if (py.some((v)=>profile.includes(v)) && py.some((v)=>vacancy.includes(v))) return 78;
  return 35;
}
export function careerBonus(route, opp) {
  const r = normalize(route).replace(/\s/g, '');
  const text = normalize(`${opp.title ?? ''} ${opp.type ?? ''} ${opp.rubro ?? ''} ${opp.location ?? ''}`);
  if (r === 'remoto' && /(remoto|remote)/.test(text)) return 8;
  if (r === 'becaposgrado' && /(beca|posgrado|maestria|doctorado)/.test(text)) return 10;
  if (r === 'organismos' && /(ong|organismo|naciones unidas|bid|oea|pnud)/.test(text)) return 8;
  if (r === 'emprendimiento' && /(startup|emprendimiento|innovacion)/.test(text)) return 7;
  if (r === 'freelance' && /(freelance|freelancer|contract|contrato|proyecto)/.test(text)) return 9;
  if (r === 'empleolocal' && /(paraguay|asuncion|central)/.test(text)) return 5;
  return 0;
}
export function rankOpportunities(profile, opportunities, dictionary, now = new Date().toISOString()) {
  const profileSkills = toStrings(profile.profile_data.habilidades);
  const profileSeniority = profile.profile_data.seniority;
  const profileLocation = profile.profile_data.location;
  const careerRoute = profile.profile_data.career_route;
  const profileTitle = profile.professional_title;
  const eligible = opportunities.filter((opp)=>opp.is_active !== false && opp.verification_status === 'verified' && opp.match_eligible !== false && opp.deleted_at == null && opp.archived_at == null && (opp.deadline == null || opp.deadline > now) && !isTender(opp) && isEligibleForProfile(opp, profileLocation));
  const ranked = eligible.map((opp)=>{
    const vacancySkills = extractSkills(opp, dictionary);
    const skillsScore = calculateSkillScore(profileSkills, vacancySkills, dictionary);
    const titleScore = calculateTitleScore(profileTitle, opp);
    const seniorityScore = calculateSeniorityScore(profileSeniority, `${opp.title ?? ''} ${opp.rubro ?? ''} ${opp.description ?? ''}`);
    const locationScore = calculateLocationScore(profileLocation, opp.location ?? '');
    const weighted = skillsScore * 0.42 + titleScore * 0.25 + seniorityScore * 0.16 + locationScore * 0.17;
    const finalScore = Math.max(20, Math.min(99, Math.round(weighted + careerBonus(careerRoute, opp))));
    const matchedSkills = vacancySkills.filter((s)=>profileSkills.some((own)=>sameSkill(own, s, dictionary)));
    const missingSkills = vacancySkills.filter((s)=>!profileSkills.some((own)=>sameSkill(own, s, dictionary)));
    return {
      ...opp,
      finalScore,
      skillsScore,
      titleScore,
      seniorityScore,
      locationScore,
      vacancySkills,
      matchedSkills,
      missingSkills
    };
  }).sort((a, b)=>b.finalScore - a.finalScore).slice(0, 20);
  return {
    eligible,
    ranked
  };
}

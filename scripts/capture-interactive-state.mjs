import fs from 'node:fs'
import WebSocket from 'ws'

const [, , debugPort = '9223', url, expression = '', output = 'tmp/interactive-state.png'] = process.argv
if (!url) throw new Error('Uso: node capture-interactive-state.mjs <port> <url> <expression> <output>')

const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page')
if (!target) throw new Error('No se encontró una pestaña de Chrome')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.on('message', data => {
  const message = JSON.parse(String(data))
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception')
  if (!message.id || !pending.has(message.id)) return
  pending.get(message.id)(message)
  pending.delete(message.id)
})
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))
  socket.send(JSON.stringify({ id, method, params }))
})
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

await call('Page.enable')
await call('Runtime.enable')
const adminScenario = expression === 'admin-moderation' || expression === 'admin-controls' || expression === 'admin-source'
const cvScenario = expression.startsWith('cv-workspace')
const atsScenario = expression.startsWith('ats-diagnostic')
const atsMobile = expression === 'ats-diagnostic-mobile' || expression === 'ats-diagnostic-mobile-questions'
const rewriteScenario = expression.startsWith('rewrite-')
const rewriteMobile = expression === 'rewrite-mobile-changes'
const applicationScenario = expression.startsWith('application-')
const applicationMobile = expression === 'application-mobile-requirements'
const learningScenario = expression.startsWith('learning-')
const learningMobile = expression === 'learning-mobile'
const adsScenario = expression.startsWith('ads-')
const adsMobile = expression === 'ads-catalog-mobile'
await call('Emulation.setDeviceMetricsOverride', adminScenario || cvScenario || (atsScenario && !atsMobile) || (rewriteScenario && !rewriteMobile) || (applicationScenario && !applicationMobile) || (learningScenario && !learningMobile) || (adsScenario && !adsMobile)
  ? { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }
  : { width: 500, height: 1000, deviceScaleFactor: 1, mobile: true })
if (adsScenario) {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      localStorage.removeItem('cvitae_consent_v1');
      const jobs = [
        { id:'ad-job-1', slug:'analista-datos', title:'Analista de datos', organization:'Nexo Comercial', location:'Asunción, Paraguay', type:'Tiempo completo', rubro:'Tecnología e IT', source:'empresa_verificada', created_at:new Date().toISOString() },
        { id:'ad-job-2', slug:'especialista-marketing', title:'Especialista en marketing digital', organization:'Estudio Horizonte', location:'Fernando de la Mora, Paraguay', type:'Híbrido', rubro:'Marketing y Publicidad', source:'empresa_verificada', created_at:new Date().toISOString() },
        { id:'ad-job-3', slug:'asistente-administrativo', title:'Asistente administrativo', organization:'Grupo Arandu', location:'San Lorenzo, Paraguay', type:'Presencial', rubro:'Administración', source:'computrabajo', created_at:new Date().toISOString() },
        { id:'ad-job-4', slug:'desarrollador-frontend', title:'Desarrollador frontend', organization:'Laboratorio Digital', location:'Remoto, Latinoamérica', type:'Remoto', rubro:'Tecnología e IT', source:'weworkremotely', created_at:new Date().toISOString() }
      ];
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init={}) => {
        const url=String(input);
        if (url.includes('/rest/v1/opportunities')) return new Response(JSON.stringify(jobs),{status:200,headers:{'Content-Type':'application/json'}});
        return nativeFetch(input,init);
      };
    })();
  ` })
} else if (learningScenario) {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      const user = { id:'72000000-0000-4000-8000-000000000002', email:'ana.aprende@example.test', role:'authenticated', aud:'authenticated' };
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token:'mock-access-token', refresh_token:'mock-refresh-token', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, token_type:'bearer', user }));
      const recommendations = [
        { id:'lr1', skill:'Power BI', priority:1, status:'in_progress', title:'Ruta práctica de Power BI', platform:'Microsoft Learn', providerKey:'microsoft_learn', url:'https://learn.microsoft.com/es-es/training/browse/?terms=Power%20BI', learningFocus:'Modelado, DAX y tableros aplicados a decisiones comerciales.', why:'Esta brecha aparece en 3 oportunidades verificadas entre tus mejores coincidencias.', level:'Intermedio', language:'Español preferido', sources:[{id:'j1',slug:'analista-power-bi',title:'Analista Power BI'},{id:'j2',slug:'especialista-datos',title:'Especialista de datos'},{id:'j3',slug:'analista-comercial',title:'Analista comercial'}], fallback:false },
        { id:'lr2', skill:'AWS', priority:2, status:'suggested', title:'Ruta práctica de AWS', platform:'AWS Skill Builder', providerKey:'aws_skill_builder', url:'https://skillbuilder.aws/', learningFocus:'Fundamentos de nube y servicios principales para entornos de datos.', why:'Esta brecha aparece en 2 oportunidades verificadas entre tus mejores coincidencias.', level:'Inicial', language:'Español preferido', sources:[{id:'j4',slug:'cloud-data-junior',title:'Cloud Data Junior'},{id:'j5',slug:'analista-cloud',title:'Analista Cloud'}], fallback:true },
        { id:'lr3', skill:'Inglés profesional', priority:3, status:'completed', title:'Ruta práctica de Inglés profesional', platform:'Coursera', providerKey:'coursera', url:'https://www.coursera.org/search?query=Ingl%C3%A9s%20profesional', learningFocus:'Comunicación escrita y oral para entrevistas y equipos internacionales.', why:'Esta brecha aparece en 4 oportunidades verificadas entre tus mejores coincidencias.', level:'Intermedio', language:'Español preferido', sources:[{id:'j6',slug:'remote-data-analyst',title:'Remote Data Analyst'}], fallback:false, completedAt:new Date().toISOString() }
      ];
      const payload = { recommendations, courses:recommendations, stats:{ total:3, suggested:1, inProgress:1, completed:1 } };
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init={}) => {
        const url=String(input); const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
        if (url.includes('/auth/v1/user')) return json(user);
        if (url.includes('/.netlify/functions/gemini-courses')) return json(payload);
        if (url.includes('/.netlify/functions/cv-ats-workspace')) return json({openQuestionCount:2});
        return nativeFetch(input,init);
      };
    })();
  ` })
} else if (cvScenario) {
  const confirmed = expression === 'cv-workspace-confirmed'
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      const user = { id: '20000000-0000-0000-0000-000000000002', email: 'ana.ejemplo@example.test', role: 'authenticated', aud: 'authenticated' };
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user }));
      const profile = { id: '20000000-0000-0000-0000-000000000001', user_id: user.id, full_name: 'Ana Ejemplo', professional_title: 'Analista de datos junior', summary: 'Analista orientada a convertir datos operativos en decisiones claras.', is_subscribed: false, profile_data: { habilidades: ['SQL','Excel','Power BI'], cursos: ['Fundamentos de visualizaciÃ³n de datos'], location: 'AsunciÃ³n, Paraguay', seniority: 'Junior' } };
      const pending = [
        { id:'e1', category:'achievement', claim:'AutomaticÃ© un reporte semanal para el equipo comercial', confirmed_value:null, context:'Analista â€” Empresa Ejemplo', source_kind:'uploaded_cv', source_label:'ana-ejemplo.pdf', status:'pending' },
        { id:'e2', category:'skill', claim:'Power BI', confirmed_value:null, context:null, source_kind:'profile', source_label:'Mi perfil', status:'pending' },
        { id:'e3', category:'education', claim:'Licenciatura en AdministraciÃ³n â€” Universidad Ejemplo â€” 2025', confirmed_value:null, context:null, source_kind:'uploaded_cv', source_label:'ana-ejemplo.pdf', status:'pending' }
      ];
      const reviewed = [
        { id:'e4', category:'identity', claim:'Ana Ejemplo', confirmed_value:null, context:null, source_kind:'profile', source_label:'Mi perfil', status:'confirmed' },
        { id:'e5', category:'skill', claim:'SQL', confirmed_value:null, context:null, source_kind:'profile', source_label:'Mi perfil', status:'confirmed' },
        { id:'e6', category:'skill', claim:'Excel', confirmed_value:null, context:null, source_kind:'profile', source_label:'Mi perfil', status:'confirmed' }
      ];
      const versions = ${confirmed ? `[{
        id:'v3', vacancy_id:'base_cv', version_number:3, parent_version_id:'v2', label:'EdiciÃ³n confirmada', generation_kind:'manual', user_attested:true, created_at:new Date().toISOString(), evidence_snapshot:[{value:'SQL'},{value:'Excel'},{value:'Power BI'}], vacancy_snapshot:{}, cv_markdown:'# Ana Ejemplo\\nAnalista de datos junior | ana.ejemplo@example.test | AsunciÃ³n, Paraguay\\n\\n## Resumen Profesional\\nAnalizo informaciÃ³n operativa con SQL, Excel y Power BI para comunicar hallazgos de forma clara.\\n\\n## Habilidades\\n- SQL\\n- Excel\\n- Power BI\\n\\n## EducaciÃ³n\\nLicenciatura en AdministraciÃ³n â€” Universidad Ejemplo â€” 2025'
      },{
        id:'v2', vacancy_id:'staging-opportunity-0001', version_number:1, parent_version_id:'v1', label:'Adaptado a Analista de datos', generation_kind:'adapted', user_attested:true, created_at:new Date(Date.now()-86400000).toISOString(), evidence_snapshot:[{value:'SQL'},{value:'Excel'}], vacancy_snapshot:{title:'Analista de datos'}, cv_markdown:'# Ana Ejemplo\\nAnalista de datos junior\\n\\n## Habilidades\\n- SQL\\n- Excel'
      },{
        id:'v1', vacancy_id:'base_cv', version_number:1, parent_version_id:null, label:'CV general', generation_kind:'base', user_attested:true, created_at:new Date(Date.now()-172800000).toISOString(), evidence_snapshot:[{value:'SQL'}], vacancy_snapshot:{}, cv_markdown:'# Ana Ejemplo\\nAnalista de datos junior\\n\\n## Habilidades\\n- SQL'
      }]` : '[]'};
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input);
        const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (url.includes('/auth/v1/user')) return json(user);
        if (url.includes('/rest/v1/user_master_profiles')) {
          const accept = String(init.headers?.Accept || init.headers?.accept || '');
          return json(accept.includes('object+json') ? profile : [profile]);
        }
        if (url.includes('/functions/v1/match-batch')) return json({ matches:[{ id:'staging-opportunity-0001', titulo:'Analista de datos', finalScore:91 }], is_subscribed:false });
        if (url.includes('/.netlify/functions/cv-workspace')) {
          const body = JSON.parse(init.body || '{}');
          if (body.action === 'review_evidence') return json({ evidence:{ id:body.evidenceId, status:body.decision, confirmed_value:body.confirmedValue } });
          if (body.action === 'review_all') return json({ confirmed:(body.evidenceIds || []).length });
          return json({ profileExists:true, evidence:${confirmed ? 'reviewed.map(item => ({...item,status:"confirmed"}))' : '[...pending,...reviewed]'}, versions });
        }
        return nativeFetch(input, init);
      };
    })();
  ` })
} else if (applicationScenario) {
  const readyApplication = expression === 'application-ready'
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      const user = { id:'50000000-0000-4000-8000-000000000002', email:'ana.postula@example.test', role:'authenticated', aud:'authenticated' };
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token:'mock-access-token', refresh_token:'mock-refresh-token', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, token_type:'bearer', user }));
      const opportunity = { id:'job-ana-1', slug:'analista-de-datos-junior', title:'Analista de datos junior', organization:'Nexo Comercial', location:'Asunción · Híbrido', description:'Buscamos dominio de SQL y Excel. Power BI es deseable. Se valorará experiencia comunicando reportes a equipos comerciales.', tags:['SQL','Excel','Power BI'], deadline:'2026-09-12T23:59:00Z', application_url:'https://example.com/jobs/analista', source:'empresa_verificada', opportunity_kind:'empleo', verification_status:'verified', is_active:true, catalog_eligible:true };
      const version = { id:'v3', vacancy_id:'base_cv', version_number:3, label:'CV general', generation_kind:'manual', created_at:new Date(Date.now()-86400000).toISOString(), cv_markdown:'# Ana Ejemplo' };
      const workspace = { id:'aw1', opportunity_id:opportunity.id, source_version_id:version.id, status:${readyApplication ? "'ready'" : "'draft'"}, opportunity_snapshot:{ id:opportunity.id, slug:opportunity.slug, title:opportunity.title, organization:opportunity.organization, location:opportunity.location, deadline:opportunity.deadline, source:opportunity.source }, application_url_snapshot:opportunity.application_url, prepared_version_id:${readyApplication ? "'v4'" : 'null'}, accepted_at:${readyApplication ? 'new Date().toISOString()' : 'null'}, opened_at:null, submitted_self_reported_at:null, created_at:new Date().toISOString(), fit_summary:{ coverage_score:72, label:'Respaldo parcial', supported:2, partial:1, not_evidenced:1, total:4, missing_essential:0 }, requirement_analysis:[
        { id:'r1', text:'dominio de SQL y Excel', importance:'essential', status:'supported', explanation:'Encontramos evidencia confirmada que respalda este requisito.', evidence:[{id:'e1',category:'skill',value:'SQL',source:'Mi perfil'},{id:'e2',category:'skill',value:'Excel',source:'Mi perfil'}] },
        { id:'r2', text:'Power BI es deseable', importance:'preferred', status:'supported', explanation:'Encontramos evidencia confirmada que respalda este requisito.', evidence:[{id:'e3',category:'skill',value:'Power BI',source:'Mi perfil'}] },
        { id:'r3', text:'experiencia comunicando reportes a equipos comerciales', importance:'preferred', status:'partial', explanation:'Hay evidencia relacionada, pero no permite afirmar una coincidencia completa.', evidence:[{id:'e4',category:'achievement',value:'Automaticé un reporte semanal para el equipo comercial',source:'ana-ejemplo.pdf'}] },
        { id:'r4', text:'experiencia en modelos predictivos', importance:'context', status:'not_evidenced', explanation:'No encontramos evidencia confirmada para afirmar este requisito.', evidence:[] }
      ], tailored_cv_markdown:'# Ana Ejemplo\\n\\nAnalista de datos junior | ana.postula@example.test | Asunción, Paraguay\\n\\n## Resumen Profesional\\n\\nAnalista de datos junior con experiencia confirmada en automatización de reportes comerciales.\\n\\n## Habilidades\\n\\n- SQL\\n- Excel\\n- Power BI\\n\\n## Experiencia Profesional\\n\\n- Automaticé un reporte semanal para el equipo comercial.', cover_message:'Hola, equipo de Nexo Comercial.\\n\\nMe interesa la posición de Analista de datos junior. Cuento con experiencia confirmada en SQL, Excel, Power BI y automatización de reportes para equipos comerciales.\\n\\nQuedo disponible para conversar sobre mi experiencia.', checklist:[
        {id:'review-official',label:'Revisar nuevamente las bases y la fecha en la fuente oficial',kind:'official'},
        {id:'verify-contact',label:'Verificar que los datos de contacto del CV estén vigentes',kind:'document'},
        {id:'download-cv',label:'Descargar y revisar la versión adaptada del CV',kind:'document'},
        {id:'copy-message',label:'Personalizar y copiar el mensaje de presentación',kind:'document'},
        {id:'gap-1',label:'Preparar una respuesta honesta sobre: experiencia en modelos predictivos',kind:'gap'}
      ], checklist_progress:{'review-official':true}, safety_checks:{passed:true} };
      const payload = { profileExists:true, opportunity, versions:[version], workspaces:[workspace], evidenceReadiness:{pending:0,confirmed:8,ready:true} };
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init={}) => {
        const url=String(input); const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
        if (url.includes('/auth/v1/user')) return json(user);
        if (url.includes('/.netlify/functions/application-workspace')) return json(payload);
        return nativeFetch(input,init);
      };
    })();
  ` })
} else if (rewriteScenario) {
  const acceptedRewrite = expression === 'rewrite-accepted'
  const emptyRewrite = expression === 'rewrite-empty'
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      const user = { id:'40000000-0000-4000-8000-000000000002', email:'ana.rewrite@example.test', role:'authenticated', aud:'authenticated' };
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token:'mock-access-token', refresh_token:'mock-refresh-token', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, token_type:'bearer', user }));
      localStorage.setItem('cvitae_guide_b2c_cv_rewrite_v1_completed', 'true');
      const source = { id:'v3', vacancy_id:'base_cv', version_number:3, parent_version_id:'v2', label:'CV general', generation_kind:'manual', content_hash:'${'a'.repeat(64)}', created_at:new Date(Date.now()-86400000).toISOString(), cv_markdown:'# Ana Ejemplo\\n\\nAnalista de datos junior | ana.rewrite@example.test | Asunción, Paraguay\\n\\n## Resumen Profesional\\n\\nAnalista orientada a datos. Elaboración de reportes semanales.\\n\\n## Habilidades\\n\\n- SQL\\n- Excel\\n- Power BI\\n\\n## Experiencia Profesional\\n\\n- Automaticé un reporte semanal para el equipo comercial.' };
      const rewritten = { id:'v4', vacancy_id:'base_cv', version_number:4, parent_version_id:'v3', label:'Reescritura confirmada · CV general', generation_kind:'rewritten', content_hash:'${'b'.repeat(64)}', created_at:new Date().toISOString(), cv_markdown:'# Ana Ejemplo\\n\\nAnalista de datos junior | ana.rewrite@example.test | Asunción, Paraguay\\n\\n## Resumen Profesional\\n\\nAnalista de datos junior con experiencia confirmada en automatización de reportes comerciales.\\n\\n## Habilidades\\n\\n- SQL\\n- Excel\\n- Power BI\\n\\n## Experiencia Profesional\\n\\n- Automaticé un reporte semanal utilizado por el equipo comercial.' };
      const proposal = { id:'p1', source_version_id:'v3', objective:'ats_clarity', status:${acceptedRewrite ? "'accepted'" : "'draft'"}, proposal_markdown:rewritten.cv_markdown, safety_checks:{ passed:true, valid_evidence_references:true, numeric_claims_backed:true }, accepted_version_id:${acceptedRewrite ? "'v4'" : 'null'}, accepted_at:${acceptedRewrite ? 'new Date().toISOString()' : 'null'}, created_at:new Date().toISOString(), changes:[
        { id:'change-1', section:'header', kind:'name', before:'Ana Ejemplo', after:'Ana Ejemplo', reason:'Conserva la identidad confirmada en un encabezado simple.', evidence:[{ id:'e1', category:'identity', value:'Ana Ejemplo', source:'Mi perfil' }] },
        { id:'change-2', section:'summary', kind:'paragraph', before:'Analista orientada a datos.', after:'Analista de datos junior con experiencia confirmada en automatización de reportes comerciales.', reason:'Hace explícito el foco profesional usando solo experiencia confirmada.', evidence:[{ id:'e2', category:'title', value:'Analista de datos junior', source:'Mi perfil' },{ id:'e3', category:'experience', value:'Automaticé un reporte semanal para el equipo comercial', source:'ana-ejemplo.pdf' }] },
        { id:'change-3', section:'skills', kind:'bullet', before:'SQL', after:'SQL', reason:'Mantiene la habilidad confirmada en una sección ATS previsible.', evidence:[{ id:'e4', category:'skill', value:'SQL', source:'Mi perfil' }] },
        { id:'change-4', section:'experience', kind:'bullet', before:'Automaticé un reporte semanal para el equipo comercial.', after:'Automaticé un reporte semanal utilizado por el equipo comercial.', reason:'Aclara la redacción sin agregar métricas ni alcance no confirmado.', evidence:[{ id:'e3', category:'experience', value:'Automaticé un reporte semanal para el equipo comercial', source:'ana-ejemplo.pdf' }] }
      ] };
      const workspace = { profileExists:true, versions:${acceptedRewrite ? '[rewritten,source]' : '[source]'}, proposals:${emptyRewrite ? '[]' : '[proposal]'}, evidenceReadiness:{ pending:0, confirmed:7, ready:true } };
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init={}) => {
        const url=String(input); const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
        if (url.includes('/auth/v1/user')) return json(user);
        if (url.includes('/.netlify/functions/cv-rewrite-workspace')) return json(workspace);
        if (url.includes('/.netlify/functions/cv-ats-workspace')) return json({openQuestionCount:2});
        return nativeFetch(input,init);
      };
    })();
  ` })
} else if (atsScenario) {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      const user = { id: '30000000-0000-4000-8000-000000000002', email: 'ana.ats@example.test', role: 'authenticated', aud: 'authenticated' };
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user }));
      localStorage.setItem('cvitae_guide_b2c_ats_diagnostic_v1_completed', 'true');
      const questions = [
        { id:'q1', assessment_id:'a1', position:1, priority:1, category:'achievement', question:'¿Qué resultado concreto y verificable obtuviste al automatizar el reporte semanal?', why_asked:'El CV describe la tarea, pero no muestra el cambio producido.', suggested_context:'Podés indicar tiempo ahorrado, frecuencia o cantidad de personas beneficiadas, solo si recordás el dato.', status:'open', answer_text:null },
        { id:'q2', assessment_id:'a1', position:2, priority:2, category:'experience', question:'¿Cuál fue tu responsabilidad directa en el tablero comercial?', why_asked:'No queda claro qué parte del trabajo realizaste vos.', suggested_context:'Diferenciá tu aporte del trabajo general del equipo.', status:'open', answer_text:null },
        { id:'q3', assessment_id:'a1', position:3, priority:3, category:'language', question:'¿Tenés un nivel de inglés que puedas respaldar con uso o certificación?', why_asked:'El idioma aparece sin nivel ni contexto de uso.', suggested_context:'Podés mencionar uso laboral, académico o una certificación real.', status:'answered', answer_text:'Inglés intermedio usado para leer documentación técnica.', evidence_id:'e1' }
      ];
      const assessment = { id:'a1', source_kind:'generated_cv', source_label:'CV general · v3', source_version_id:'v3', overall_score:67, created_at:new Date().toISOString(), category_scores:[
        { key:'parsing_structure', score:18, max:20, reason:'Las secciones principales se distinguen en el texto.', evidence:'Resumen Profesional · Experiencia · Educación' },
        { key:'essential_sections', score:15, max:20, reason:'Incluye las secciones centrales, pero falta contexto de contacto.', evidence:'Analista de datos junior' },
        { key:'clarity_concision', score:14, max:20, reason:'El lenguaje es claro aunque varias tareas son genéricas.', evidence:'Elaboración de reportes semanales' },
        { key:'evidence_impact', score:8, max:20, reason:'Hay responsabilidades, pero pocos resultados verificables.', evidence:'Automaticé un reporte semanal' },
        { key:'relevance_keywords', score:12, max:20, reason:'Menciona herramientas relevantes sin explicar profundidad de uso.', evidence:'SQL · Excel · Power BI' }
      ], strengths:[
        { title:'Estructura fácil de recorrer', evidence:'Resumen Profesional · Experiencia · Educación' },
        { title:'Herramientas identificables', evidence:'SQL, Excel y Power BI' }
      ], blockers:[
        { severity:'high', issue:'Experiencia descrita sin resultados', evidence:'Automaticé un reporte semanal', whyItMatters:'El reclutador no puede dimensionar el aporte.', nextAction:'Responder la pregunta de resultado con un dato real o describir el cambio cualitativo.' },
        { severity:'medium', issue:'Nivel de herramientas sin contexto', evidence:'SQL · Excel · Power BI', whyItMatters:'Una lista aislada no demuestra uso aplicado.', nextAction:'Relacionar cada herramienta con una tarea confirmada.' }
      ], quick_wins:[{ action:'Aclarar alcance de responsabilidades', expectedEffect:'Mejora la lectura de tu aporte individual.' },{ action:'Completar nivel de idioma', expectedEffect:'Evita una señal ambigua para búsquedas bilingües.' }], keyword_observations:[{ term:'Power BI', observation:'Aparece como habilidad, pero no vinculado a un proyecto concreto.' },{ term:'reportes', observation:'Se repite sin especificar audiencia, frecuencia o finalidad.' }], questions };
      const workspace = { rubricVersion:'ats-v1', rubricNotice:'Diagnóstico orientativo basado en señales observables.', assessments:[assessment], versions:[{ id:'v3', vacancy_id:'base_cv', version_number:3, label:'CV general', generation_kind:'manual', cv_markdown:'# Ana Ejemplo', created_at:new Date().toISOString() }], openQuestionCount:2 };
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input);
        const json = value => new Response(JSON.stringify(value), { status:200, headers:{ 'Content-Type':'application/json' } });
        if (url.includes('/auth/v1/user')) return json(user);
        if (url.includes('/.netlify/functions/cv-ats-workspace')) return json(workspace);
        return nativeFetch(input, init);
      };
    })();
  ` })
} else if (adminScenario) {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/admin-auth')) return new Response(JSON.stringify({ authenticated: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/admin-data')) {
        const action = JSON.parse(init.body || '{}').action;
        const responses = {
          metrics: { usuarios: 48, oportunidades: 133, empresasActivas: 4 },
          list_content: { data: [] }, list_users: { data: [] }, list_skills: { data: [] }, list_tokens: { data: [] },
          list_beta: { betaList: [], leads: [] }, list_b2b_prospects: { data: [] },
          scraper_report: { totalOpportunities: 135, totalContentHub: 60, newLast24h: 0, newLast7d: 133, duplicates: 0, bySource: [], scraperRuns: [], runSummary: {}, telemetryAvailable: true },
          opportunity_review_summary: { summary: { pending: 12, in_review: 3, verified: 133, rejected: 4, quarantined: 57 }, inventory: { total: 209, published: 133, archived: 0, deleted: 0, deletion_pending: 1, by_type: { empleo: 151, beca: 31, pasantia: 15, concurso: 8, programa: 4 } } },
          list_control_center: { sourceStats: { computrabajo: { total: 133, verified: 133, pending: 0 }, clasipar: { total: 55, verified: 0, pending: 55 } }, controls: [
            { scraper_id: 'computrabajo_scraper', scraper_name: 'Computrabajo Paraguay', script_path: 'scrapers/computrabajo_scraper.py', collection_enabled: true, max_items_per_run: 800, max_runtime_seconds: 1200, consecutive_failures_before_pause: 3, auto_pause_on_failure: true, require_review: false, allowed_country_codes: ['PY'], paused_reason: null, audit_status: 'candidate', audit_found_count: 379, audit_valid_count: 379, audit_unique_count: 40, audit_sample_count: 20, audit_notes: 'Extracción paraguaya concreta confirmada; fuente previamente verificada y operativa.', last_audited_at: new Date().toISOString() },
            { scraper_id: 'buscojobs_scraper', scraper_name: 'BuscoJobs Paraguay', script_path: 'scrapers/buscojobs_scraper.py', collection_enabled: false, max_items_per_run: 250, max_runtime_seconds: 600, consecutive_failures_before_pause: 3, auto_pause_on_failure: true, require_review: true, allowed_country_codes: ['PY'], paused_reason: 'Requiere reparación', audit_status: 'empty', audit_found_count: 0, audit_valid_count: 0, audit_unique_count: 0, audit_sample_count: 0, audit_notes: 'Ejecución real aislada: no produjo oportunidades válidas. Mantener pausado y reparar.', last_audited_at: new Date().toISOString() }
          ], sources: [
            { source: 'computrabajo', display_name: 'Computrabajo Paraguay', trust_level: 'trusted', is_enabled: true, auto_verify: true, catalog_enabled: true, matching_enabled: true, alerts_enabled: true, seo_enabled: true, max_items_per_day: 800, retention_days: 30, allowed_country_codes: ['PY'] },
            { source: 'clasipar', display_name: 'Clasipar', trust_level: 'review', is_enabled: false, auto_verify: false, catalog_enabled: false, matching_enabled: false, alerts_enabled: false, seo_enabled: false, max_items_per_day: 100, retention_days: 14, allowed_country_codes: ['PY'] }
          ] },
          list_opportunity_reviews: { count: 2, sources: [{ source: 'computrabajo', display_name: 'Computrabajo Paraguay' }, { source: 'candidate_custom', display_name: 'Vacante aportada por candidato' }], data: [
            { id: '1', title: 'Analista de datos junior', organization: 'Empresa de tecnología', location: 'Asunción', source: 'candidate_custom', application_url: 'https://example.com/job/1', original_source_url: 'https://empresa.example/careers/analista', original_source_verified: true, source_authority: 'aggregator', opportunity_type: 'job', eligible_countries: ['PY'], deadline: '2026-09-30T23:59:00Z', description: 'Buscamos una persona con SQL, Excel y capacidad analítica. Postulación abierta hasta fin de mes.', rubro: 'Tecnología', verification_status: 'in_review', verification_score: null, verification_reasons: [], verification_note: null, deletion_review_status: 'pending', deletion_requested_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null, created_at: new Date().toISOString() },
            { id: '2', title: 'Asistente administrativo', organization: null, location: 'San Lorenzo', source: 'scraper_nuevo', application_url: 'https://example.com/job/2', description: null, rubro: 'Administración', verification_status: 'pending', verification_score: 40, verification_reasons: ['La fuente y el enlace de postulación son accesibles'], verification_note: null, reviewed_at: null, reviewed_by: null, created_at: new Date().toISOString() }
          ] }
        };
        return new Response(JSON.stringify(responses[action] || { ok: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  ` })
}
await call('Page.navigate', { url })
if (atsScenario || rewriteScenario || applicationScenario) {
  await wait(1200)
  await call('Runtime.evaluate', {
    expression: `history.pushState({}, '', '${rewriteScenario ? '/mi-carrera/mejorar' : applicationScenario ? '/mi-carrera/postular/analista-de-datos-junior' : '/mi-carrera/ats'}'); window.dispatchEvent(new PopStateEvent('popstate')); true`,
    returnByValue: true,
  })
}
await wait(8000)
if (expression) {
  const action = expression === 'rewrite-empty'
    ? 'true'
    : expression === 'ads-consent-banner'
      ? 'true'
    : expression === 'ads-consent-settings'
      ? `new Promise(resolve => {
          const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.includes('Personalizar'));
          button?.click();
          setTimeout(() => resolve(true), 700);
        })`
    : expression === 'ads-catalog-mobile'
      ? `new Promise(resolve => {
          const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.includes('Aceptar todas'));
          button?.click();
          setTimeout(() => {
            document.querySelector('[data-ad-placement]')?.scrollIntoView({ block:'center' });
            setTimeout(() => resolve(true), 700);
          }, 500);
        })`
    : expression === 'learning-top'
      ? 'true'
    : expression === 'learning-mobile'
      ? `new Promise(resolve => {
          const target = document.querySelector('article');
          target?.scrollIntoView({ block:'start' });
          setTimeout(() => resolve(true), 700);
        })`
    : expression === 'rewrite-changes' || expression === 'rewrite-mobile-changes'
      ? `new Promise(resolve => {
          const target = Array.from(document.querySelectorAll('h2')).find(item => item.textContent.includes('Mesa de cambios'));
          target?.scrollIntoView({ block:'start' });
          setTimeout(() => resolve(true), 700);
        })`
    : expression === 'rewrite-preview'
      ? `new Promise(resolve => {
          const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.trim() === 'Vista completa');
          button?.click();
          setTimeout(() => {
            const target = Array.from(document.querySelectorAll('h2')).find(item => item.textContent.includes('Mesa de cambios'));
            target?.scrollIntoView({ block:'start' });
            setTimeout(() => resolve(true), 500);
          }, 500);
        })`
    : expression === 'rewrite-accepted'
      ? `new Promise(resolve => {
          const target = Array.from(document.querySelectorAll('h2')).find(item => item.textContent.includes('Reescritura guardada'));
          target?.scrollIntoView({ block:'center' });
          setTimeout(() => resolve(true), 700);
        })`
    : expression === 'application-top'
      ? 'true'
    : expression === 'application-requirements' || expression === 'application-mobile-requirements'
      ? `new Promise(resolve => {
          const target = Array.from(document.querySelectorAll('h2')).find(item => item.textContent.includes('Lo que podés demostrar'));
          target?.scrollIntoView({ block:'start' });
          setTimeout(() => resolve(true), 700);
        })`
    : expression === 'application-cv' || expression === 'application-message' || expression === 'application-checklist'
      ? `new Promise(resolve => {
          const label = '${expression === 'application-cv' ? 'CV adaptado' : expression === 'application-message' ? 'Mensaje' : 'Checklist'}';
          const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.includes(label));
          button?.click();
          setTimeout(() => {
            const target = Array.from(document.querySelectorAll('h2')).find(item => item.textContent.includes('Lo que podés demostrar'));
            target?.scrollIntoView({ block:'start' });
            setTimeout(() => resolve(true), 500);
          }, 500);
        })`
    : expression === 'application-ready'
      ? `new Promise(resolve => {
          const target = Array.from(document.querySelectorAll('h2')).find(item => item.textContent.includes('Salida controlada'));
          target?.scrollIntoView({ block:'center' });
          setTimeout(() => resolve(true), 700);
        })`
    : expression === 'ats-diagnostic-top' || expression === 'ats-diagnostic-mobile'
    ? 'true'
    : expression === 'ats-diagnostic-questions' || expression === 'ats-diagnostic-mobile-questions'
    ? `new Promise(resolve => {
        const target = Array.from(document.querySelectorAll('h2')).find(item => item.textContent.includes('Preguntas para completar'));
        target?.scrollIntoView({ block:'start' });
        setTimeout(() => resolve(true), 700);
      })`
    : expression === 'ats-diagnostic-score'
      ? `new Promise(resolve => {
          const target = Array.from(document.querySelectorAll('p')).find(item => item.textContent.includes('Diagnóstico seleccionado'));
          target?.scrollIntoView({ block:'start' });
          setTimeout(() => resolve(true), 700);
        })`
    : expression === 'cv-workspace-review'
    ? `new Promise(resolve => {
        const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.trim() === 'Confirmar');
        button?.click();
        setTimeout(() => resolve(true), 700);
      })`
    : expression.startsWith('cv-workspace')
      ? 'true'
    : expression === 'company-form'
    ? `new Promise(resolve => {
        const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.includes('Solicitar acceso verificado'));
        button?.click();
        setTimeout(() => {
          document.querySelector('input[placeholder="Nombre y apellido"]')?.scrollIntoView({ block: 'start' });
          resolve(true);
        }, 500);
      })`
    : adminScenario
      ? `new Promise(resolve => {
          const input = document.querySelector('input[type="password"]');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'local-review');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.closest('form').requestSubmit();
          setTimeout(() => {
            Array.from(document.querySelectorAll('button')).find(item => item.textContent.includes('${expression === 'admin-moderation' ? 'Verificación' : 'Fuentes y reglas'}'))?.click();
            setTimeout(() => {
              const candidates = Array.from(document.querySelectorAll('button')).filter(item => item.textContent.includes('${expression === 'admin-moderation' ? 'Analista de datos junior' : 'Computrabajo Paraguay'}'));
              candidates[${expression === 'admin-source' ? 'candidates.length - 1' : '0'}]?.click();
              resolve(true);
            }, 800);
          }, 1200);
        })`
      : expression
  await call('Runtime.evaluate', { expression: action, awaitPromise: true, returnByValue: true })
  await wait(1200)
}
const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
const diagnostic = await call('Runtime.evaluate', { expression: `({ url: location.href, title: document.title, text: document.body?.innerText?.slice(0, 500) || '', rootChildren: document.getElementById('root')?.childElementCount || 0 })`, returnByValue: true })
fs.mkdirSync(new URL('../tmp/', import.meta.url), { recursive: true })
fs.writeFileSync(output, Buffer.from(result.data, 'base64'))
socket.close()
console.log(output, JSON.stringify(diagnostic.result?.value || {}), JSON.stringify({ runtimeErrors }))

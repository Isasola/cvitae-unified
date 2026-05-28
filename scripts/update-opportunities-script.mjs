import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.join(__dirname, '../client/src/data/opportunities.json')

const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY
const FINDWORK_API_KEY = process.env.FINDWORK_API_KEY
const SERPAPI_KEY = process.env.SERPAPI_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const JOOBLE_API_KEY = process.env.JOOBLE_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

let allOpportunities = []

// Función de enriquecimiento con Gemini (para todo tipo)
async function enrichWithGemini(title, company, location, originalUrl, type = 'empleo') {
  if (!GEMINI_API_KEY) return null
  const basePrompt = type === 'beca' 
    ? `Eres un redactor experto en oportunidades educativas. Genera una descripción atractiva en español para la siguiente beca o programa:`
    : `Eres un redactor profesional de ofertas de empleo. Genera una descripción atractiva en español para la siguiente vacante:`
  const prompt = `${basePrompt} ${title} en ${company || 'institución'}. Ubicación: ${location || 'Paraguay'}. Incluye responsabilidades, requisitos y beneficios. Al final añade: "Ver oportunidad original: ${originalUrl}"`
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    )
    const generatedText = response.data.candidates?.[0]?.content?.parts?.[0]?.text
    if (generatedText) return generatedText.trim()
  } catch (e) { console.error(`Gemini error: ${e.message}`) }
  return null
}

// 1. Adzuna (empleos)
if (ADZUNA_APP_ID && ADZUNA_APP_KEY) {
  try {
    const res = await axios.get(`https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=20&what=developer&content-type=application/json`)
    const jobs = res.data.results.map(job => ({
      id: `adzuna-${job.id}`, title: job.title, organization: job.company.display_name,
      location: job.location.display_name, continent: 'Global', type: 'empleo', rubro: 'Tecnología',
      value: job.salary_min ? `£${Math.round(job.salary_min)} - £${Math.round(job.salary_max)}` : 'Competitivo',
      deadline: 'Abierto', compatibility: 75, tags: ['Adzuna', 'Tecnología'],
      description: `Oportunidad laboral: ${job.title} en ${job.company.display_name}.\n\n[👉 Ver oportunidad original y postular aquí](${job.redirect_url})`,
      application_url: job.redirect_url, source: 'Adzuna',
    }))
    allOpportunities = [...allOpportunities, ...jobs]
  } catch (e) { console.error('Error Adzuna:', e.message) }
}

// 2. FindWork (tech)
if (FINDWORK_API_KEY) {
  try {
    const res = await axios.get('https://findwork.dev/api/jobs/', { headers: { Authorization: `Token ${FINDWORK_API_KEY}` } })
    const jobs = res.data.results.slice(0, 20).map(job => ({
      id: `findwork-${job.id}`, title: job.role, organization: job.company_name,
      location: job.remote ? 'Remoto' : (job.location || 'Global'), continent: 'Global', type: 'empleo', rubro: 'Tecnología',
      value: 'Competitivo', deadline: 'Abierto', compatibility: 80, tags: job.keywords?.slice(0, 3) || ['Remoto'],
      description: `Oportunidad laboral: ${job.role} en ${job.company_name}.\n\n[👉 Ver oportunidad original y postular aquí](${job.url})`,
      application_url: job.url, source: 'FindWork',
    }))
    allOpportunities = [...allOpportunities, ...jobs]
  } catch (e) { console.error('Error FindWork:', e.message) }
}

// 3. SerpAPI (empleos Paraguay)
if (SERPAPI_KEY) {
  try {
    const res = await axios.get('https://serpapi.com/search.json', { params: { engine: 'google_jobs', q: 'empleos en paraguay', hl: 'es', gl: 'py', api_key: SERPAPI_KEY } })
    const jobs = res.data.jobs_results?.slice(0, 10).map(job => ({
      id: `serp-${job.job_id}`, title: job.title, organization: job.company_name,
      location: job.location, continent: 'Sudamérica', type: 'empleo', rubro: 'General',
      value: 'Competitivo', deadline: 'Abierto', compatibility: 85, tags: ['Paraguay', 'Local'],
      description: `Oportunidad laboral: ${job.title} en ${job.company_name}.\n\n[👉 Ver oportunidad original y postular aquí](${job.related_links?.[0]?.link || ''})`,
      application_url: job.related_links?.[0]?.link || '', source: 'Google Jobs',
    })) || []
    allOpportunities = [...allOpportunities, ...jobs]
  } catch (e) { console.error('Error SerpAPI:', e.message) }
}

// 4. SerpAPI (becas y foros Paraguay) - NUEVO
if (SERPAPI_KEY) {
  try {
    const res = await axios.get('https://serpapi.com/search.json', { params: { engine: 'google', q: 'becas paraguay 2026 foros empleo', hl: 'es', gl: 'py', api_key: SERPAPI_KEY } })
    const items = res.data.organic_results?.slice(0, 10).map(result => ({
      id: `serp-becas-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: result.title,
      organization: result.source || 'Institución',
      location: 'Paraguay',
      continent: 'Sudamérica',
      type: 'beca',
      rubro: 'Educación',
      value: 'Variable',
      deadline: 'Consultar',
      compatibility: 70,
      tags: ['Beca', 'Formación'],
      description: result.snippet || 'Más información en el enlace original.',
      application_url: result.link,
      source: 'Google Search',
    })) || []
    allOpportunities = [...allOpportunities, ...items]
  } catch (e) { console.error('Error SerpAPI becas:', e.message) }
}

// 5. Jooble
if (JOOBLE_API_KEY) {
  try {
    const res = await axios.post('https://jooble.org/api/', { keywords: 'empleo', location: 'Paraguay', apiKey: JOOBLE_API_KEY })
    const jobs = res.data.jobs?.slice(0, 20).map(job => ({
      id: `jooble-${job.id || Math.random().toString(36).substr(2, 9)}`, title: job.title, organization: job.company,
      location: job.location || 'Paraguay', continent: 'Sudamérica', type: 'empleo', rubro: 'General',
      value: job.salary || 'Competitivo', deadline: job.updated || 'Abierto', compatibility: 80, tags: ['Paraguay', 'Jooble'],
      description: `Oportunidad laboral: ${job.title} en ${job.company}.\n\n[👉 Ver oportunidad original y postular aquí](${job.link})`,
      application_url: job.link, source: 'Jooble',
    })) || []
    allOpportunities = [...allOpportunities, ...jobs]
  } catch (e) { console.error('Error Jooble:', e.message) }
}

// 6. Apify (opcional, descomentá si querés usarlo)
// if (APIFY_API_KEY) { ... }

// 7. Enriquecimiento con Gemini (limitado a 5)
console.log('🤖 Enriquecimiento con Gemini...')
const MAX_GEMINI_CALLS = 5
let geminiProcessed = 0
for (const opp of allOpportunities) {
  if (geminiProcessed >= MAX_GEMINI_CALLS) break
  const enriched = await enrichWithGemini(opp.title, opp.organization, opp.location, opp.application_url, opp.type)
  if (enriched) { opp.description = enriched; geminiProcessed++ }
  await new Promise(resolve => setTimeout(resolve, 3000))
}

// 8. Guardar JSON
fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ total: allOpportunities.length, timestamp: new Date().toISOString(), opportunities: allOpportunities }, null, 2))

// 9. Supabase
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const upsertData = allOpportunities.map(opp => ({
      titulo: opp.title, slug: `opp-${opp.id}`, cuerpo: opp.description,
      categoria: opp.rubro || 'General', tipo: opp.type, is_active: true,
      ubicacion: opp.location,
      metadata: { organization: opp.organization, location: opp.location, value: opp.value, tags: opp.tags, application_url: opp.application_url, source: opp.source },
      fecha_vencimiento: opp.deadline && opp.deadline !== 'Abierto' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }))
    await supabase.from('content_hub').upsert(upsertData, { onConflict: 'slug' })
    console.log('✅ Supabase actualizado')
  } catch (e) { console.error('Error Supabase:', e.message) }
}

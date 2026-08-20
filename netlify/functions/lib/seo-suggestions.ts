/**
 * SEO Suggestions Engine — Phase 6
 *
 * Pipeline: deterministic rules → parser → only ambiguous fields → Bedrock
 * Safe fields for suggestions: title, employmentType, city, organization
 * NEVER suggest: salary, streetAddress, postalCode, deadline, invented company
 * All suggestions require evidence from the source content.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { observeAiCall } from './ai-telemetry'
import type { SupabaseClient } from '@supabase/supabase-js'

const MODEL_HAIKU = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

const SAFE_FIELDS_FOR_BATCH = new Set(['title', 'employmentType'])
const FORBIDDEN_FIELDS = new Set(['salary', 'streetAddress', 'postalCode', 'deadline', 'wage'])

interface RawOpp {
  id: string
  title: string | null
  description: string | null
  organization: string | null
  location: string | null
  type: string | null
  opportunity_type: string | null
  source: string | null
  seo_missing_fields?: string[] | null
}

export interface Suggestion {
  field: string
  current_value: string | null
  suggested_value: string
  confidence: number
  evidence: string
  source: 'deterministic' | 'bedrock-haiku'
}

function bedrockClient() {
  return new BedrockRuntimeClient({
    region: process.env.CVITAE_AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
    },
  })
}

async function askBedrock(system: string, user: string): Promise<string> {
  const client = bedrockClient()
  const cmd = new InvokeModelCommand({
    modelId: MODEL_HAIKU,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const res = await observeAiCall({ provider: 'bedrock', model: MODEL_HAIKU, feature: 'seo_field_suggestions', trigger: 'user_action', actor: 'admin' }, () => client.send(cmd))
  const parsed = JSON.parse(new TextDecoder().decode(res.body))
  return parsed.content[0]?.text ?? ''
}

const EMPLOYMENT_TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/\btime completo\b|\bfull.?time\b|\bjornada completa\b/i, 'FULL_TIME'],
  [/\btime parcial\b|\bpart.?time\b|\bmedio.?tiempo\b/i, 'PART_TIME'],
  [/\bconsultor[ía]?\b|\bconsult\b|\bfreelance\b/i, 'CONTRACTOR'],
  [/\btemporal\b|\btempor[áa]rio\b|\btemporary\b/i, 'TEMPORARY'],
  [/\bpas[aá]nte?\b|\bpracticant\b|\bpr[áa]ctica\b|\binternship\b/i, 'INTERN'],
  [/\bvoluntar[io]\b|\bvolunteer\b/i, 'VOLUNTEER'],
]

// Deterministic suggestions that don't need AI
function deterministic(opp: RawOpp): Suggestion[] {
  const suggestions: Suggestion[] = []
  const desc = (opp.description || '').slice(0, 3000)
  const text = `${opp.title || ''} ${desc}`

  // Employment type from description
  if (!opp.type && ['job', 'internship', 'consultancy'].includes(opp.opportunity_type || '')) {
    for (const [regex, value] of EMPLOYMENT_TYPE_KEYWORDS) {
      if (regex.test(text)) {
        suggestions.push({
          field: 'employmentType',
          current_value: opp.type,
          suggested_value: value,
          confidence: 0.90,
          evidence: `Keyword match in description: "${regex.source}"`,
          source: 'deterministic',
        })
        break
      }
    }
  }

  return suggestions
}

// AI-powered suggestions for ambiguous fields (only called when deterministic misses)
async function aiSuggestions(opp: RawOpp, alreadySuggested: Set<string>): Promise<Suggestion[]> {
  if (!process.env.SEO_AI_SUGGESTIONS || process.env.SEO_AI_SUGGESTIONS !== 'true') {
    return []
  }

  const missingFields = (opp.seo_missing_fields || []).filter(
    f => !alreadySuggested.has(f) && !FORBIDDEN_FIELDS.has(f)
  )

  const eligibleForAI = missingFields.filter(f =>
    ['organization', 'city', 'region', 'country', 'title'].includes(f) &&
    !FORBIDDEN_FIELDS.has(f)
  )

  if (eligibleForAI.length === 0) return []

  const system = `You are an SEO data quality assistant for CVitae, a job/scholarship board in Paraguay.
Your task: extract factual field values from job/scholarship descriptions.
Rules:
- Only extract values that are EXPLICITLY stated in the source text. Never invent.
- For organization: only if the company/org name is clearly written in the description.
- For city/region/country: only if a location is explicitly mentioned.
- Do NOT suggest salary, street address, postal code, or deadline.
- Respond ONLY with valid JSON, no explanation.
- confidence must be between 0 and 1. Use >= 0.9 only when very certain.`

  const user = `Title: ${opp.title || '(none)'}
Organization: ${opp.organization || '(none)'}
Location: ${opp.location || '(none)'}
Type: ${opp.opportunity_type || '(none)'}
Description (first 2000 chars): ${(opp.description || '').slice(0, 2000)}

Fields that need values (extract ONLY if explicitly in the text above): ${eligibleForAI.join(', ')}

Respond as JSON array: [{"field":"...", "suggested_value":"...", "confidence":0.0-1.0, "evidence":"quote from text that proves this"}]
If a field cannot be found in the text, omit it. Return [] if nothing found.`

  try {
    const raw = await askBedrock(system, user)
    const json = raw.match(/\[[\s\S]*\]/)?.[0]
    if (!json) return []
    const items: Array<{ field: string; suggested_value: string; confidence: number; evidence: string }> = JSON.parse(json)
    return items
      .filter(item =>
        item.field &&
        item.suggested_value &&
        typeof item.confidence === 'number' &&
        !FORBIDDEN_FIELDS.has(item.field) &&
        item.confidence >= 0.5
      )
      .map(item => ({
        field: item.field,
        current_value: (opp as any)[item.field] ?? null,
        suggested_value: item.suggested_value,
        confidence: Math.min(1, Math.max(0, item.confidence)),
        evidence: item.evidence || 'Extracted from description',
        source: 'bedrock-haiku' as const,
      }))
  } catch (err: any) {
    console.error('[seo-suggestions] AI parse error', err?.message)
    return []
  }
}

export async function generateAndPersistSuggestions(
  supabase: SupabaseClient,
  opportunityId: string,
  dryRun = true,
): Promise<{ suggestions: Suggestion[]; persisted: number; dryRun: boolean }> {
  const { data: opp, error } = await supabase
    .from('opportunities')
    .select('id,title,description,organization,location,type,opportunity_type,source,seo_missing_fields')
    .eq('id', opportunityId)
    .maybeSingle()

  if (error || !opp) {
    console.error('[seo-suggestions] fetch error', opportunityId, error?.message)
    return { suggestions: [], persisted: 0, dryRun }
  }

  const detSuggestions = deterministic(opp as RawOpp)
  const alreadySuggested = new Set(detSuggestions.map(s => s.field))
  const aiSugg = await aiSuggestions(opp as RawOpp, alreadySuggested)

  const all = [...detSuggestions, ...aiSugg]

  if (dryRun || all.length === 0) {
    return { suggestions: all, persisted: 0, dryRun }
  }

  // Persist — upsert pattern (one active suggestion per field)
  let persisted = 0
  for (const s of all) {
    const { error: insErr } = await supabase.from('seo_suggestions').upsert({
      opportunity_id: opportunityId,
      field: s.field,
      current_value: s.current_value,
      suggested_value: s.suggested_value,
      confidence: s.confidence,
      evidence: s.evidence,
      source: s.source,
      status: 'pending',
    }, {
      onConflict: 'opportunity_id,field',
      ignoreDuplicates: false,
    })
    if (!insErr) persisted++
    else console.error('[seo-suggestions] persist error', s.field, insErr.message)
  }

  return { suggestions: all, persisted, dryRun: false }
}

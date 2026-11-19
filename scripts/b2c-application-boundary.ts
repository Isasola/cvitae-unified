import { createHash, randomUUID } from 'node:crypto'

// Local external-boundary adapter. It deliberately does not claim PostgreSQL,
// RLS, locking or deployed RPC evidence. Handler, evidence sync and normalizer
// execute unchanged; only auth, Supabase transport and Bedrock are replaced.
export const userA = { id: 'user-a', email: 'candidate-a@example.invalid' }
export const userB = { id: 'user-b', email: 'candidate-b@example.invalid' }
export const opportunity = {
  id: 'opportunity-a', slug: 'local-application-a', title: 'Analista local',
  organization: 'Organización fixture', description: 'Análisis de datos. Inglés avanzado.',
  tags: [], deadline: null, application_url: 'https://official.example.invalid/apply',
  source: 'fixture-source', opportunity_kind: 'job', updated_at: '2026-10-08T12:00:00Z',
}
const fingerprint = (category: string, claim: string) => createHash('sha256').update(`${category}::${claim.toLowerCase()}`).digest('hex')
const now = () => new Date().toISOString()
const clone = <T>(value: T): T => structuredClone(value)
export const state: any = { tables: {}, fail: {}, calls: [], modelCalls: 0, canonical: true }

export function reset() {
  state.fail = {}; state.calls = []; state.modelCalls = 0; state.semanticCalls = 0; state.canonical = true; state.pause = null
  state.tables = {
    opportunity_catalog_universe: [clone(opportunity)],
    user_master_profiles: [
      { id: 'profile-a', user_id: userA.id, full_name: 'Candidata Local A', professional_title: 'Analista de datos', summary: 'Análisis de datos', profile_data: {} },
      { id: 'profile-b', user_id: userB.id, full_name: 'Persona Privada B', professional_title: 'OTRO_USUARIO_SECRETO', profile_data: {} },
    ],
    generated_cvs: [
      { id: 'source-a', user_id: userA.id, label: 'CV original A', version_number: 1, generation_kind: 'base', cv_markdown: '# Candidata Local A\n\nAnalista de datos\n\nAnálisis de datos', content_hash: 'source-hash-a', created_at: now(), parent_version_id: null },
      { id: 'source-a-older', user_id: userA.id, label: 'CV anterior A', version_number: 0, generation_kind: 'base', cv_markdown: '# Candidata Local A\n\nAnalista de datos\n\nAnálisis de datos', content_hash: 'source-hash-older', created_at: '2025-01-01T00:00:00Z', parent_version_id: null },
      { id: 'source-b', user_id: userB.id, label: 'CV privado B', version_number: 1, cv_markdown: '# OTRO_USUARIO_SECRETO', content_hash: 'source-hash-b', created_at: now() },
    ], application_workspaces: [], cv_evidence_items: [],
  }
  for (const [category, claim, id] of [
    ['identity', 'Candidata Local A', 'identity-a'], ['title', 'Analista de datos', 'title-a'], ['summary', 'Análisis de datos', 'summary-a'],
  ]) state.tables.cv_evidence_items.push({ id, user_id: userA.id, category, claim, confirmed_value: claim, fingerprint: fingerprint(category, claim), source_kind: 'profile', source_label: 'Mi perfil', status: 'confirmed', active: true, created_at: now() })
}

class Query {
  table: string; filters: [string, any][] = []; mode = 'select'; payload: any; one = false
  count = false; head = false; maximum = Infinity; ordering: any
  constructor(table: string) { this.table = table }
  select(_fields?: string, options?: any) { this.count = options?.count === 'exact'; this.head = !!options?.head; return this }
  eq(key: string, value: any) { this.filters.push([key, value]); return this }
  order(key: string, options: any) { this.ordering = [key, options.ascending]; return this }
  limit(n: number) { this.maximum = n; return this }
  maybeSingle() { this.one = true; return this }
  single() { this.one = true; return this }
  insert(payload: any) { this.mode = 'insert'; this.payload = payload; return this }
  update(payload: any) { this.mode = 'update'; this.payload = payload; return this }
  then(resolve: any, reject: any) { return Promise.resolve().then(() => this.execute()).then(resolve, reject) }
  execute() {
    state.calls.push({ table: this.table, mode: this.mode, filters: clone(this.filters) })
    if (this.mode === 'insert' && this.table === 'application_workspaces' && state.fail.insert) {
      state.fail.insert = false; return { data: null, error: { message: 'fixture persist failure' } }
    }
    const table = state.tables[this.table]
    if (!table) throw new Error(`Unexpected boundary table ${this.table}`)
    let rows = table.filter((row: any) => this.filters.every(([key, value]) => row[key] === value))
    if (this.table === 'opportunity_catalog_universe' && !state.canonical) rows = []
    if (this.mode === 'insert') {
      const row = { id: randomUUID(), created_at: now(), updated_at: now(), checklist_progress: {}, prepared_version_id: null, ...clone(this.payload) }
      table.push(row); rows = [row]
    } else if (this.mode === 'update') rows.forEach((row: any) => Object.assign(row, clone(this.payload)))
    if (this.ordering) { const [key, asc] = this.ordering; rows.sort((a: any, b: any) => String(a[key]).localeCompare(String(b[key])) * (asc ? 1 : -1)) }
    const count = rows.length; rows = rows.slice(0, this.maximum)
    return { data: this.head ? null : clone(this.one ? rows[0] || null : rows), error: null, ...(this.count ? { count } : {}) }
  }
}

export const database = {
  from: (table: string) => new Query(table),
  async rpc(name: string, input: any) {
    state.calls.push({ rpc: name, input: clone(input) })
    if (state.pause?.name === name) await state.pause.promise
    if (name === 'consume_api_rate_limit') return { data: [{ allowed: true, remaining: 5, retry_after_seconds: 0 }], error: null }
    const workspace = state.tables.application_workspaces.find((row: any) => row.id === input.p_workspace_id && row.user_id === input.p_user_id)
    const error = (message: string) => ({ data: null, error: { message } })
    if (!workspace) return error('application workspace not found')
    if (state.fail[name]) { state.fail[name] = false; return error(`fixture ${name} failure`) }
    if (name === 'accept_application_workspace') {
      if (!input.p_attested) return error('explicit attestation is required')
      if (!workspace.prepared_version_id) {
        if (!state.canonical) return error('opportunity is no longer available')
        const source = state.tables.generated_cvs.find((row: any) => row.id === workspace.source_version_id && row.user_id === input.p_user_id)
        if (!source || source.content_hash !== workspace.source_content_hash) return error('source CV changed or is unavailable')
        if (!workspace.safety_checks.passed) return error('did not pass safety checks')
        // One synchronous boundary transaction; no SQL/locking claim.
        const version = { id: randomUUID(), user_id: input.p_user_id, vacancy_id: workspace.opportunity_id, version_number: Math.max(...state.tables.generated_cvs.filter((row: any) => row.user_id === input.p_user_id).map((row: any) => row.version_number)) + 1, parent_version_id: workspace.source_version_id, cv_markdown: workspace.tailored_cv_markdown, evidence_snapshot: clone(workspace.evidence_snapshot), vacancy_snapshot: clone(workspace.opportunity_snapshot), generation_kind: 'adapted', label: 'Postulación · Analista local', user_attested: true, created_at: now() }
        state.tables.generated_cvs.push(version)
        Object.assign(workspace, { prepared_version_id: version.id, status: 'ready', accepted_at: now() })
      }
      return { data: [{ workspace_id: workspace.id, prepared_version_id: workspace.prepared_version_id, status: workspace.status }], error: null }
    }
    if (name === 'update_application_checklist') {
      if (Object.entries(input.p_progress).some(([key, value]) => !workspace.checklist.some((item: any) => item.id === key) || typeof value !== 'boolean')) return error('invalid checklist item')
      workspace.checklist_progress = clone(input.p_progress)
      return { data: clone(workspace.checklist_progress), error: null }
    }
    if (name === 'advance_application_workspace') {
      if (!['ready', 'opened', 'submitted'].includes(workspace.status)) return error('application is not ready')
      if (input.p_action === 'opened') { workspace.status = workspace.status === 'ready' ? 'opened' : workspace.status; workspace.opened_at ||= now() }
      else if (input.p_action === 'submitted') { workspace.status = 'submitted'; workspace.opened_at ||= now(); workspace.submitted_self_reported_at ||= now() }
      else throw new Error(`Unexpected transition ${input.p_action}`)
      return { data: [{ workspace_id: workspace.id, status: workspace.status }], error: null }
    }
    throw new Error(`Unexpected boundary RPC ${name}`)
  },
}

export const anonymous = { auth: { async getUser(token: string) { const user = token === 'token-a' ? userA : token === 'token-b' ? userB : null; return { data: { user }, error: user ? null : { message: 'invalid token' } } } } }
export async function model(command?: any) {
  state.modelCalls += 1
  if (state.fail.provider) { state.fail.provider = false; throw new Error('fixture provider unavailable') }
  const prompt = command ? JSON.parse(command.input.body).messages[0].content : ''
  if (prompt.startsWith('REQUIREMENT_SEMANTIC_ASSESSMENT')) {
    state.semanticCalls = (state.semanticCalls || 0) + 1
    state.semanticPrompt = prompt
    if (state.fail.semanticProvider) { state.fail.semanticProvider = false; throw new Error('fixture semantic provider unavailable') }
    const inputs = JSON.parse(prompt.split('ENTRADAS CONFIRMADAS (máximo 24 requisitos y 8 hechos citados por requisito):\n')[1])
    // Provider responses are a declared LOCAL semantic oracle, not a production
    // semantic model. Real handler builds pairs from scoped confirmed facts.
    const decisions = inputs.map((item: any) => {
      const related = item.candidates.filter((fact: any) =>
        (item.text === 'Análisis de datos' && fact.value === 'Análisis de datos')
        || (item.text === 'Experience managing projects' && fact.value === 'Led implementation of X across three teams, coordinating milestones and delivery.'))
      return { requirementId: item.id, requirementText: item.text, status: related.length ? 'supported' : 'not_evidenced',
        evidenceIds: related.map((fact: any) => fact.id), evidenceQuotes: related.map((fact: any) => ({ evidenceId: fact.id, value: fact.value })),
        rationale: related.length ? 'Confirmed activity directly demonstrates the required competency.' : 'Inventory/data evidence does not establish a language proficiency.' }
    })
    return { body: new TextEncoder().encode(JSON.stringify({ content: [{ text: JSON.stringify({ decisions }) }] })) }
  }
  const result = {
    requirements: [
      { text: 'Análisis de datos', importance: 'essential', status: 'supported', evidenceIds: ['summary-a'] },
      { text: 'Inglés avanzado', importance: 'essential', status: 'supported', evidenceIds: ['summary-a'] },
      { text: 'Requisito inventado', importance: 'essential', status: 'supported', evidenceIds: ['summary-a'] },
    ], cvBlocks: [
      { section: 'header', kind: 'name', text: 'Candidata Local A', evidenceIds: ['identity-a'] },
      { section: 'header', kind: 'headline', text: 'Analista de datos', evidenceIds: ['title-a'] },
      { section: 'summary', kind: 'paragraph', text: 'Análisis de datos', evidenceIds: ['summary-a'] },
      { section: 'experience', kind: 'bullet', text: '99 años de experiencia', evidenceIds: ['summary-a'] },
      { section: 'skills', kind: 'bullet', text: 'Inglés avanzado', evidenceIds: ['nonexistent'] },
    ], coverBlocks: [{ text: 'Soy CEO inventado', evidenceIds: ['identity-a'] }, { text: 'Inglés avanzado', evidenceIds: ['summary-a'] }],
  }
  if (state.fail.unbacked) {
    state.fail.unbacked = false
    result.cvBlocks = [
      { section: 'header', kind: 'name', text: 'Candidata Local A', evidenceIds: ['identity-a'] },
      { section: 'summary', kind: 'paragraph', text: 'Análisis de datos', evidenceIds: ['summary-a'] },
      { section: 'skills', kind: 'bullet', text: 'Inglés avanzado', evidenceIds: ['summary-a'] },
    ]
  }
  return { body: new TextEncoder().encode(JSON.stringify({ content: [{ text: JSON.stringify(result) }] })) }
}
reset()

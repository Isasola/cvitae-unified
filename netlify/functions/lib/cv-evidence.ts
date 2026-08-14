import { createHash } from 'node:crypto'

export type EvidenceDraft = {
  category: string
  claim: string
  context?: string | null
  sourceKind: 'profile' | 'uploaded_cv' | 'manual'
  sourceLabel?: string | null
}

function text(value: unknown, maxLength = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function values(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function evidenceFingerprint(category: string, claim: string, context = ''): string {
  return createHash('sha256')
    .update(`${category}:${text(context, 500).toLowerCase()}:${text(claim).toLowerCase()}`)
    .digest('hex')
}

function addDraft(target: EvidenceDraft[], draft: EvidenceDraft) {
  const claim = text(draft.claim)
  if (!claim) return
  const duplicate = target.some((item) =>
    item.category === draft.category &&
    text(item.claim).toLowerCase() === claim.toLowerCase() &&
    text(item.context).toLowerCase() === text(draft.context).toLowerCase()
  )
  if (!duplicate) target.push({ ...draft, claim, context: text(draft.context, 500) || null })
}

export function evidenceFromProfile(profile: any): EvidenceDraft[] {
  const drafts: EvidenceDraft[] = []
  const profileData = profile?.profile_data || {}
  const source = { sourceKind: 'profile' as const, sourceLabel: 'Mi perfil' }

  addDraft(drafts, { category: 'identity', claim: profile?.full_name, ...source })
  addDraft(drafts, { category: 'title', claim: profile?.professional_title, ...source })
  addDraft(drafts, { category: 'summary', claim: profile?.summary, ...source })
  addDraft(drafts, { category: 'contact', claim: profileData.location, context: 'Ubicación', ...source })
  addDraft(drafts, { category: 'contact', claim: profileData.phone, context: 'Teléfono', ...source })
  addDraft(drafts, { category: 'contact', claim: profileData.linkedin, context: 'LinkedIn', ...source })

  for (const skill of values(profileData.habilidades)) {
    addDraft(drafts, { category: 'skill', claim: skill, ...source })
  }
  for (const course of values(profileData.cursos)) {
    addDraft(drafts, { category: 'course', claim: course, ...source })
  }
  for (const experience of values(profileData.experience)) {
    const context = [text(experience?.position, 160), text(experience?.company, 160), text(experience?.period, 100)]
      .filter(Boolean).join(' — ')
    if (context) addDraft(drafts, { category: 'experience', claim: context, ...source })
    for (const achievement of values(experience?.achievements)) {
      addDraft(drafts, { category: 'achievement', claim: achievement, context, ...source })
    }
  }
  for (const education of values(profileData.education)) {
    const claim = [text(education?.degree, 200), text(education?.institution, 200), text(education?.year, 20)]
      .filter(Boolean).join(' — ')
    addDraft(drafts, { category: 'education', claim, ...source })
  }
  for (const language of values(profileData.languages)) {
    const claim = [text(language?.language, 100), text(language?.level, 100)].filter(Boolean).join(': ')
    addDraft(drafts, { category: 'language', claim, ...source })
  }
  return drafts
}

export function evidenceFromExtraction(extracted: any, sourceFileName: string): EvidenceDraft[] {
  const drafts: EvidenceDraft[] = []
  const source = {
    sourceKind: 'uploaded_cv' as const,
    sourceLabel: text(sourceFileName, 240) || 'CV cargado',
  }
  addDraft(drafts, { category: 'identity', claim: extracted?.full_name, ...source })
  addDraft(drafts, { category: 'title', claim: extracted?.professional_title, ...source })
  addDraft(drafts, { category: 'contact', claim: extracted?.email, context: 'Correo', ...source })
  addDraft(drafts, { category: 'contact', claim: extracted?.location, context: 'Ubicación', ...source })
  for (const skill of values(extracted?.skills)) addDraft(drafts, { category: 'skill', claim: skill, ...source })
  for (const experience of values(extracted?.experience)) {
    const context = [text(experience?.position, 160), text(experience?.company, 160), experience?.years ? `${experience.years} años` : '']
      .filter(Boolean).join(' — ')
    if (context) addDraft(drafts, { category: 'experience', claim: context, ...source })
    for (const achievement of values(experience?.achievements)) {
      addDraft(drafts, { category: 'achievement', claim: achievement, context, ...source })
    }
  }
  for (const education of values(extracted?.education)) {
    const claim = [text(education?.degree, 200), text(education?.institution, 200), text(education?.year, 20)]
      .filter(Boolean).join(' — ')
    addDraft(drafts, { category: 'education', claim, ...source })
  }
  for (const language of values(extracted?.languages)) {
    const claim = [text(language?.language, 100), text(language?.level, 100)].filter(Boolean).join(': ')
    addDraft(drafts, { category: 'language', claim, ...source })
  }
  return drafts
}

export async function syncEvidence(
  supabase: any,
  userId: string,
  profileId: string | null,
  drafts: EvidenceDraft[],
  deactivateSourceKind?: EvidenceDraft['sourceKind'],
) {
  if (deactivateSourceKind) {
    const { error } = await supabase
      .from('cv_evidence_items')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('source_kind', deactivateSourceKind)
    if (error) throw error
  }

  for (const draft of drafts.slice(0, 150)) {
    const fingerprint = evidenceFingerprint(draft.category, draft.claim, draft.context || '')
    const { data: existing, error: findError } = await supabase
      .from('cv_evidence_items')
      .select('id,source_kind,source_label')
      .eq('user_id', userId)
      .eq('fingerprint', fingerprint)
      .limit(1)
      .maybeSingle()
    if (findError) throw findError

    const preserveUploadedSource = existing?.source_kind === 'uploaded_cv' && draft.sourceKind === 'profile'
    const payload = {
      profile_id: profileId,
      category: draft.category,
      claim: text(draft.claim),
      context: text(draft.context, 500) || null,
      source_kind: preserveUploadedSource ? 'uploaded_cv' : draft.sourceKind,
      source_label: preserveUploadedSource
        ? existing.source_label
        : text(draft.sourceLabel, 240) || null,
      active: true,
      updated_at: new Date().toISOString(),
    }
    const result = existing
      ? await supabase.from('cv_evidence_items').update(payload).eq('id', existing.id).eq('user_id', userId)
      : await supabase.from('cv_evidence_items').insert({
          ...payload,
          user_id: userId,
          fingerprint,
          status: 'pending',
        })
    if (result.error) throw result.error
  }
}

export async function confirmedEvidence(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('cv_evidence_items')
    .select('id,category,claim,confirmed_value,context,source_kind,source_label,reviewed_at')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map((item: any) => ({
    id: item.id,
    category: item.category,
    value: text(item.confirmed_value || item.claim),
    context: item.context,
    source: item.source_label || item.source_kind,
    confirmed_at: item.reviewed_at,
  }))
}

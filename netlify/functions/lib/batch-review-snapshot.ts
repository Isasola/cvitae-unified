export interface BatchCandidate {
  id: string
  updated_at?: string | null
  source_authority?: string | null
  original_source_verified?: boolean | null
  verification_status: string
  catalog_eligible?: boolean | null
  match_eligible?: boolean | null
  alerts_eligible?: boolean | null
  seo_eligible?: boolean | null
}

export interface ExplicitFeatures {
  catalog: boolean
  matching: boolean
  alerts: boolean
  seo: boolean
}

export type SnapshotValidation =
  | { ok: true; ids: string[]; features: ExplicitFeatures; reviewById: Map<string, any> }
  | { ok: false; status: number; error: string; staleIds?: string[] }

export function selectBatchMutationCandidates<T extends { id: unknown }>(candidates: T[], validatedIds: string[]): T[] {
  const exactIds = new Set(validatedIds.map(String))
  return candidates.filter(candidate => exactIds.has(String(candidate.id)))
}

export function validateBatchApprovalSnapshot(candidates: BatchCandidate[], payload: any, sourceTrusted?: boolean): SnapshotValidation {
  const ids = Array.isArray(payload?.ids) ? [...new Set(payload.ids.map(String))] : []
  if (!ids.length) return { ok: false, status: 400, error: 'La aprobacion requiere un snapshot explicito de IDs' }
  const features = payload?.features
  const keys = ['catalog', 'matching', 'alerts', 'seo'] as const
  if (!features || !keys.every(key => typeof features[key] === 'boolean')) {
    return { ok: false, status: 400, error: 'catalog, matching, alerts y seo deben enviarse explicitamente' }
  }
  if (!String(payload?.note || '').trim()) return { ok: false, status: 400, error: 'El motivo de aprobacion en lote es obligatorio' }
  if (!String(payload?.idempotency_key || '').trim()) return { ok: false, status: 400, error: 'idempotency_key requerido' }

  const reviewSnapshot = Array.isArray(payload?.review_snapshot) ? payload.review_snapshot : []
  const reviewById = new Map(reviewSnapshot.map((item: any) => [String(item?.id), item]))
  if (ids.some(id => !reviewById.has(id))) {
    return { ok: false, status: 400, error: 'Cada ID requiere evidencia del Review Bot en el snapshot' }
  }
  const invalidEvidenceIds = ids.filter(id => {
    const evidence = reviewById.get(id)
    return evidence?.recommendation !== 'approve' || !String(evidence?.rules_version || '').trim()
  })
  if (invalidEvidenceIds.length) {
    return { ok: false, status: 409, error: 'Solo se pueden aprobar registros recomendados por Review Bot', staleIds: invalidEvidenceIds }
  }

  const candidateIds = new Set(candidates.map(candidate => String(candidate.id)))
  const staleIds = ids.filter(id => !candidateIds.has(id))
  if (staleIds.length) return { ok: false, status: 409, error: 'El lote cambio desde el preview; genera un preview nuevo', staleIds }

  const changedIds = ids.filter(id => {
    const candidate = candidates.find(item => String(item.id) === id)
    const evidence = reviewById.get(id)
    return Boolean(candidate?.updated_at && evidence?.record_updated_at && candidate.updated_at !== evidence.record_updated_at)
  })
  if (changedIds.length) {
    return { ok: false, status: 409, error: 'Hay registros modificados despues del Review Bot; genera un preview nuevo', staleIds: changedIds }
  }

  // Authority may be inherited only from a source explicitly trusted and enabled.
  if (!sourceTrusted) {
    const ineligible = ids.filter(id => {
      const candidate = candidates.find(item => String(item.id) === id)
      return !candidate || (candidate.source_authority !== 'original' && !candidate.original_source_verified)
    })
    if (ineligible.length) return { ok: false, status: 409, error: 'El snapshot contiene registros sin fuente original verificada', staleIds: ineligible }
  }
  return { ok: true, ids, features: features as ExplicitFeatures, reviewById }
}

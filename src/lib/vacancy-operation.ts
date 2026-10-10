// A submitted vacancy keeps its operation and payload until the server confirms it.
// Storage contains public vacancy draft data, never the recruiter access token.
const key = (organizationId: string) => `cvitae_vacancy_operation:${organizationId}`
export function pendingVacancy(organizationId: string): { id: string; payload: Record<string, string> } | null {
  const raw = sessionStorage.getItem(key(organizationId))
  if (!raw) return null
  const value = JSON.parse(raw)
  if (typeof value?.id !== 'string' || !value.payload || typeof value.payload !== 'object') throw new Error('No pudimos recuperar la operación pendiente.')
  return value
}
export function beginVacancy(organizationId: string, payload: Record<string, string>) {
  const pending = pendingVacancy(organizationId)
  if (pending) {
    if (JSON.stringify(pending.payload) !== JSON.stringify(payload)) throw new Error('Recuperá el formulario pendiente y reintentá para confirmar su resultado antes de crear otra vacante.')
    return pending.id
  }
  const id = `vacancy:${crypto.randomUUID()}`
  sessionStorage.setItem(key(organizationId), JSON.stringify({ id, payload }))
  return id
}
export function completeVacancy(organizationId: string) { sessionStorage.removeItem(key(organizationId)) }

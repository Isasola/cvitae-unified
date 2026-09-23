/** Browser response semantics kept independent from the Vite/Supabase client. */
export async function decodePublicOpportunityResponse<T>(response: Pick<Response, 'status' | 'ok' | 'json'>, slug?: string): Promise<T[] | T | null> {
  if (slug && response.status === 404) return null
  if (!response.ok) throw new Error('public_policy_unavailable')
  return response.json() as Promise<T[] | T>
}

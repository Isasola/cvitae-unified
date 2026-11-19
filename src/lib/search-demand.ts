export type DemandRecommendation = 'CREATE' | 'IMPROVE' | 'MONITOR' | 'IGNORE'
export interface DemandRow { query: string; clicks: number; impressions: number; position: number }
export interface LandingInventory { count: number; existingLanding?: boolean; canonical?: string }
export interface PublicOpportunityDemandRow { city?: string | null }
export const DEMAND_POLICY = { minInventoryForLanding: 3, minImpressionsForAction: 10, improveCtrBelow: 0.03 }
const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const cityAliases: Record<string, string> = { cde:'ciudad-del-este', 'ciudad del este':'ciudad-del-este', asuncion:'asuncion', luque:'luque', capiata:'capiata', paraguay:'paraguay' }
function location(q: string) { return Object.entries(cityAliases).find(([alias]) => new RegExp(`(^| )${alias}( |$)`).test(q))?.[0] }
export function demandCluster(query: string): string {
  const q = norm(query), jobs = /trabaj|empleo|bolsa/.test(q)
  if (/\b(cv|curriculum)\b/.test(q)) return 'CV PARAGUAY'
  const place = location(q)
  if (jobs && place) return `JOBS:${cityAliases[place]}`
  return 'IGNORE'
}
/**
 * Demand is compared only with the effective public SEO inventory. A row
 * contributes solely when its canonical city maps to an existing intent
 * cluster; location, eligibility and remote scope are never substituted.
 */
export function publicOpportunityDemandInventory(rows: PublicOpportunityDemandRow[]): Record<string, LandingInventory> {
  const inventory: Record<string, LandingInventory> = {}
  for (const row of rows) {
    const city = String(row.city || '').trim()
    if (!city) continue
    const cluster = demandCluster(`empleos ${city}`)
    if (!cluster.startsWith('JOBS:')) continue
    inventory[cluster] = { count: (inventory[cluster]?.count || 0) + 1, existingLanding: false }
  }
  return inventory
}
export function recommendDemand(rows: DemandRow[], inventory: Record<string, LandingInventory | number>) {
  const grouped = new Map<string, DemandRow[]>()
  for (const row of rows) { const key = demandCluster(row.query); grouped.set(key, [...(grouped.get(key) || []), row]) }
  return [...grouped].map(([cluster, values]) => {
    const clicks = values.reduce((n, row) => n + row.clicks, 0), impressions = values.reduce((n, row) => n + row.impressions, 0)
    const position = values.reduce((n, row) => n + row.position * row.impressions, 0) / Math.max(1, impressions)
    const value = inventory[cluster], entry: LandingInventory = typeof value === 'number' ? { count:value } : (value || { count:0 })
    const ctr = impressions ? clicks / impressions : 0
    const recommendation: DemandRecommendation = cluster === 'IGNORE' ? 'IGNORE' : impressions < DEMAND_POLICY.minImpressionsForAction || entry.count < DEMAND_POLICY.minInventoryForLanding ? 'MONITOR' : entry.existingLanding ? ((ctr < DEMAND_POLICY.improveCtrBelow || position > 3) ? 'IMPROVE' : 'MONITOR') : 'CREATE'
    const proposedPath = cluster.startsWith('JOBS:') ? `/empleos/${cluster.slice(5)}` : null
    // No city job landing route exists today; a proposal must not claim one is
    // live.  Existing landing canonical is the only current target.
    const targetCanonical = entry.canonical || (cluster === 'CV PARAGUAY' ? '/mi-carrera/cv' : null)
    return { cluster, clicks, impressions, position:Number(position.toFixed(1)), ctr:Number(ctr.toFixed(3)), inventory:entry.count, recommendation, proposal: recommendation === 'CREATE' || recommendation === 'IMPROVE' ? { kind: recommendation === 'CREATE' ? 'SEO_LANDING' : 'SEO_IMPROVEMENT', targetCanonical, proposedPath: targetCanonical ? null : proposedPath, evidence:{clicks, impressions, position:Number(position.toFixed(1)), ctr:Number(ctr.toFixed(3)), inventory:entry.count}, contentBrief:`Información factual de oportunidades activas para ${cluster}.` } : null }
  })
}

import { AlertTriangle, Compass, RefreshCw } from 'lucide-react'

export type MatchingCoverageView = {
  status?: 'NO_RUN' | 'SUCCESS_ZERO' | 'SUCCESS_WITH_RESULTS' | 'ERROR' | 'STALE' | string | null
  coverage_state?: 'HEALTHY' | 'LOW_RETRIEVAL_COVERAGE' | 'DATA_COVERAGE_GAP' | 'PROFESSIONAL_FIT_GAP' | 'ELIGIBILITY_UNKNOWN' | 'NO_CONFIRMED_MATCH' | 'ERROR' | 'NO_RUN' | string | null
  potential?: number | null
  potential_scoreable?: number | null
  match?: number | null
  background_scan_status?: 'NO_SCAN' | 'PARTIAL' | 'COMPLETE' | 'STALE' | 'ERROR' | string | null
  background_examined_count?: number | null
  background_target_count?: number | null
  total_inventory_count?: number | null
  inventory_funnel?: Record<string, any> | null
  inventory_funnel_at?: string | null
}

export function MatchingCoverageCard({ coverage, compact = false, onRetry }: { coverage?: MatchingCoverageView | null; compact?: boolean; onRetry?: () => void }) {
  if (!coverage) return null
  const hasRetrievalDiagnostics = coverage.total_inventory_count != null || coverage.background_scan_status != null
  const terminal = coverage.status === 'ERROR' || coverage.status === 'STALE' || coverage.status === 'NO_RUN'
  if (!hasRetrievalDiagnostics && !terminal && (coverage.status === 'SUCCESS_WITH_RESULTS' || coverage.coverage_state === 'HEALTHY')) return null
  const state = terminal ? coverage.status : (coverage.coverage_state || coverage.status || 'NO_RUN')
  const copy = hasRetrievalDiagnostics && (coverage.status === 'SUCCESS_WITH_RESULTS' || coverage.coverage_state === 'HEALTHY')
    ? 'El análisis rápido es acotado; la cobertura de fondo evalúa el universo permitido en páginas seguras.'
    : state === 'ELIGIBILITY_UNKNOWN' && Number(coverage.potential || 0) > 0
    ? 'Encontramos oportunidades potenciales. Confirmar tu país de residencia ayuda a evaluar aquellas restricciones que sí cuentan con datos suficientes; otras pueden seguir sin elegibilidad confirmada.'
    : state === 'LOW_RETRIEVAL_COVERAGE'
      ? 'La búsqueda acotada no encontró suficiente cobertura para mostrar coincidencias confirmadas.'
      : state === 'ERROR'
        ? 'No pudimos leer el diagnóstico de matching. Probá nuevamente más tarde.'
        : state === 'NO_RUN'
          ? 'Todavía no evaluamos oportunidades para este perfil.'
          : state === 'STALE'
            ? 'Tu perfil cambió desde el último análisis. La cobertura se actualizará con el próximo análisis de coincidencias.'
            : 'Todavía no encontramos coincidencias confirmadas.'
  const whyNot = coverage.inventory_funnel?.WHY_NOT_MATCH_UNIVERSE || {}
  const topReasons = Object.entries(whyNot).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3)
  const backgroundStatus = coverage.background_scan_status === 'COMPLETE' ? 'Completa' : coverage.background_scan_status === 'PARTIAL' ? 'En proceso' : coverage.background_scan_status === 'STALE' ? 'Desactualizada' : coverage.background_scan_status === 'ERROR' ? 'Con error' : 'Sin análisis'
  return (
    <section className={`rounded-2xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.04] ${compact ? 'p-4' : 'p-5'}`} aria-live="polite">
      <div className="flex items-start gap-3">
        {state === 'ERROR' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" /> : <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a84c]" aria-hidden="true" />}
        <div className="min-w-0">
          <h3 className="font-display text-base text-cream">Cobertura de tus oportunidades</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy}</p>
          {state === 'ELIGIBILITY_UNKNOWN' && <a href="/mi-carrera/perfil" className="mt-3 inline-flex items-center rounded-full border border-[#c9a84c]/40 px-3 py-1.5 text-xs font-medium text-[#c9a84c] transition hover:border-[#c9a84c]">Confirmar mi país de residencia</a>}
          {hasRetrievalDiagnostics && <p className="mt-2 text-xs text-white/60">Inventario: {coverage.total_inventory_count ?? '—'}{coverage.inventory_funnel_at ? ` (corte ${new Date(coverage.inventory_funnel_at).toLocaleDateString()})` : ''} · Evaluación de fondo: {backgroundStatus} ({coverage.background_examined_count ?? 0}/{coverage.background_target_count ?? 0})</p>}
          {topReasons.length > 0 && <p className="mt-1 text-xs text-white/45">Fuera del universo de matching: {topReasons.map(([reason, count]) => `${reason} ${count}`).join(' · ')}</p>}
          <p className="mt-2 text-xs leading-relaxed text-white/45">CVitae usa señales agregadas de cobertura para priorizar qué fuentes y regiones necesitan mejorar. No significa que no existan oportunidades para vos.</p>
          {onRetry && state === 'ERROR' && <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#c9a84c]"><RefreshCw className="h-3 w-3" /> Reintentar</button>}
        </div>
      </div>
    </section>
  )
}

import { useMemo, useState } from 'react'

type Props = {
  sources: any[]
  selectedSource: string | null
  onSelect: (source: string) => void
  onScan: (source: string) => void
  onRefresh?: () => void
  refreshedAt?: string | null
  scan: { source?: string; status?: string; requestId?: string; error?: string; run?: any } | null
  loading?: boolean
  onAction?: (action: string, payload: any) => Promise<any>
}

const SCAN_CAPABLE = new Set(['unjobs', 'himalayas', 'talentcom', 'weworkremotely'])
const gateNames = ['Discovery', 'Detail / Translator', 'Filters', 'Normalization / Quality', 'Persistence', 'Health / Observation', 'Automation', 'Distribution / Growth']
const visual = (status?: string) => status === 'PASS' ? ['✓', 'OK'] : status === 'WARNING' ? ['!', 'REVISAR'] : status === 'FAIL' ? ['✕', 'FALLÓ'] : status === 'NOT_APPLICABLE' ? ['—', 'NO APLICA'] : status === 'NOT_EVALUATED' ? ['?', 'NO EVALUADA'] : ['?', 'SIN DATOS']
const firstIssue = (gates: any[]) => gates.findIndex(gate => gate.status === 'FAIL' || gate.status === 'WARNING')
const number = (value: any) => typeof value === 'number' ? value.toLocaleString('es-PY') : '—'

function diagnosis(source: any) {
  const gates = source?.eight_gates?.gates || []
  const index = firstIssue(gates)
  if (index < 0) return { headline: '✓ Pipeline sin fallas técnicas detectadas', detail: 'La evidencia disponible no muestra un cable roto. Las políticas siguen aplicándose por separado.', recommendation: source?.auto_enabled ? 'No se requiere acción técnica' : 'Revisar la política sólo si se desea automatizar' }
  const gate = gates[index]
  const persistenceLoss = gate.reason_code?.includes('LOST_BEFORE_PERSISTENCE')
  const detailMissing = gate.reason_code?.includes('DETAIL') || gate.reason_code?.includes('EXTRACTED')
  return {
    headline: `${visual(gate.status)[0]} Primera puerta a revisar: G${index + 1} — ${gateNames[index]}`,
    detail: persistenceLoss ? 'La evidencia indica que un campo salió del traductor pero no llegó a la fila persistida.' : detailMissing ? 'La evidencia del detalle/traductor es insuficiente o falló antes de persistir.' : `Razón observada: ${gate.reason_code || 'UNKNOWN'}.`,
    recommendation: `Revisar y corregir ${gateNames[index]} — Gate ${index + 1}`,
  }
}

function metric(gate: any) {
  const m = gate?.metrics || {}
  if (typeof m.found === 'number') return `${number(m.found)} encontradas`
  if (typeof m.total === 'number') return `${number(m.total)} registros`
  if (typeof m.rejected === 'number') return `${number(m.rejected)} rechazadas`
  if (m.runtime_health) return `Runtime ${m.runtime_health} · Data ${m.data_health}`
  // Gate 7: bridge execution stats when available
  if (typeof m.evaluated === 'number') return `${number(m.evaluated)} evaluadas · ${number(m.promoted || 0)} promovidas · ${number(m.human_review || 0)} revisión`
  // Gate 8: independent capability list
  if (m.surfaces && typeof m.allowed === 'number') {
    const s = m.surfaces as Record<string, any>
    const caps = Object.entries(s)
      .filter(([, v]) => v?.state === 'ALLOWED')
      .map(([k]) => k.replace('_', ' ').toUpperCase())
    return caps.length ? caps.join(' · ') : `${m.allowed} permitidas · ${m.restricted || 0} restringidas`
  }
  if (typeof m.allowed === 'number') return `${m.allowed} superficies permitidas`
  return 'Sin métrica durable'
}

export default function SourceOperationsView({ sources, selectedSource, onSelect, onScan, onRefresh, refreshedAt, scan, loading, onAction }: Props) {
  const [tab, setTab] = useState('RESULTADOS')
  const [sourceSearch, setSourceSearch] = useState('')
  const [diagResult, setDiagResult] = useState<any>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [reconciliationPreview, setReconciliationPreview] = useState<any>(null)
  const [reconciliationResult, setReconciliationResult] = useState<any>(null)
  const [reconciliationState, setReconciliationState] = useState<'IDLE'|'QUEUED'|'RUNNING'|'SUCCESS'|'WARNING'|'ERROR'>('IDLE')
  const [policyModal, setPolicyModal] = useState(false)
  const [policyNote, setPolicyNote] = useState('')
  const [policyLoading, setPolicyLoading] = useState(false)
  const [policyResult, setPolicyResult] = useState<any>(null)
  const filteredSources = useMemo(() => {
    const q = sourceSearch.toLowerCase()
    return q ? sources.filter(s => (s.canonical_source || '').includes(q) || (s.display_name || '').toLowerCase().includes(q)) : sources
  }, [sources, sourceSearch])
  const source = sources.find(item => item.canonical_source === selectedSource) || sources.find(item => SCAN_CAPABLE.has(item.canonical_source)) || sources[0]
  const canScan = source && SCAN_CAPABLE.has(source.canonical_source)
  if (!source) return <div className="mb-6 border border-white/[0.08] p-5 text-sm text-white/45">Source Intelligence todavía no devolvió fuentes.</div>
  const gates = source.eight_gates?.gates || []
  const report = diagResult ? {
    headline: diagResult.overall_health === 'HEALTHY' ? '✓ Pipeline sin fallas técnicas detectadas' : `${diagResult.failing_gates} puerta(s) fallando · ${diagResult.warning_gates} con advertencias`,
    detail: `Diagnóstico ejecutado ${new Date(diagResult.diagnosed_at).toLocaleString('es-PY')} · ${diagResult.inventory} oportunidades · ${diagResult.observations} observaciones`,
    recommendation: diagResult.overall_health === 'HEALTHY' ? 'No se requiere acción técnica' : 'Revisar las puertas fallando en los resultados',
  } : diagnosis(source)
  const history = source.history || []
  const isThisScan = scan?.source === source.canonical_source
  const scanStatus = isThisScan ? scan?.status : undefined
  const run = isThisScan ? scan?.run : null
  const issues = gates.filter((gate: any) => gate.status === 'FAIL' || gate.status === 'WARNING')
  const fields = gates[1]?.metrics?.fields || {}
  const lineage = run?.extraction_metrics?.scan_lineage
  const sourceRows = Array.isArray(lineage?.items) ? lineage.items : []
  const technicalFailure = gates.slice(0, 6).some((gate: any) => gate.status === 'FAIL')
  const policyBlocked = !technicalFailure && [gates[6], gates[7]].some((gate: any) => gate && ['NOT_APPLICABLE', 'NOT_EVALUATED'].includes(gate.status))
  const rowOutcome = (row: any) => row.persistence !== 'PERSISTED' ? '✕ FALLÓ' : technicalFailure ? '✕ FALLÓ' : row.description_length < 80 ? '! REQUIERE REVISIÓN' : policyBlocked ? '■ BLOQUEADA POR POLÍTICA' : '✓ LISTA PARA EVALUACIÓN'

  async function handleDiagnose() {
    if (!onAction) return
    setDiagLoading(true)
    setDiagResult(null)
    try {
      const res = await onAction('diagnose_source', { source: source.canonical_source })
      setDiagResult(res)
    } finally {
      setDiagLoading(false)
    }
  }

  async function handleReconciliationPreview(scope = source.canonical_source) {
    if (!onAction) return
    setDiagLoading(true); setReconciliationState('QUEUED'); setReconciliationResult(null)
    try { setReconciliationState('RUNNING'); setReconciliationPreview(await onAction('preview_inventory_reconciliation', { source: scope })); setReconciliationState('SUCCESS') }
    catch { setReconciliationState('ERROR') }
    finally { setDiagLoading(false) }
  }

  async function handleReconciliationApply(resume = false) {
    if (!onAction || !reconciliationPreview?.reconciliation_id) return
    setDiagLoading(true); setReconciliationState('QUEUED')
    try {
      setReconciliationState('RUNNING')
      let result = await onAction(resume ? 'resume_inventory_reconciliation' : 'apply_inventory_reconciliation', resume
        ? { reconciliation_id: reconciliationPreview.reconciliation_id }
        : { reconciliation_id: reconciliationPreview.reconciliation_id, confirm: true })
      // Each server request checkpoints one bounded chunk. Continue normal
      // RUNNING chunks automatically; only a real failure exposes REANUDAR.
      let guard = 0
      while (result.status === 'RUNNING' && guard++ < 10000) {
        setReconciliationResult(result)
        result = await onAction('resume_inventory_reconciliation', { reconciliation_id: reconciliationPreview.reconciliation_id })
      }
      setReconciliationResult(result)
      setReconciliationState(result.status === 'WARNING' ? 'WARNING' : result.status === 'SUCCESS' ? 'SUCCESS' : 'RUNNING')
      if (onRefresh) onRefresh()
    } catch { setReconciliationState('ERROR') }
    finally { setDiagLoading(false) }
  }

  async function handleTelemetryRetry() {
    if (!onAction) return
    setDiagLoading(true); setReconciliationState('QUEUED')
    try { setReconciliationState('RUNNING'); setReconciliationResult(await onAction('retry_maintenance_telemetry', { source: source.canonical_source })); setReconciliationState('SUCCESS') }
    catch { setReconciliationState('ERROR') }
    finally { setDiagLoading(false) }
  }

  async function handleApprovePolicy() {
    if (!onAction || !policyNote.trim()) return
    setPolicyLoading(true)
    try {
      const res = await onAction('approve_search_indexing_policy', { source: source.canonical_source, admin_note: policyNote })
      setPolicyResult(res)
      setPolicyModal(false)
      if (onRefresh) onRefresh()
    } finally {
      setPolicyLoading(false)
    }
  }

  return <section className="mb-7 border border-[#c9a84c]/25 bg-[#0b0b0b]">
    {policyModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md border border-white/20 bg-[#0b0b0b] p-6">
        <h3 className="text-sm font-bold text-white">Aprobar política SEO — {source.canonical_source}</h3>
        <p className="mt-2 text-xs text-white/55">Esto establece search_engine_indexing_allowed=TRUE. Acción auditada y no reversible por esta interfaz.</p>
        <textarea value={policyNote} onChange={e => setPolicyNote(e.target.value)} placeholder="Nota de aprobación (requerida)..." className="mt-4 w-full resize-none border border-white/20 bg-black px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none" rows={3} />
        <div className="mt-4 flex gap-3">
          <button onClick={handleApprovePolicy} disabled={policyLoading || !policyNote.trim()} className="border border-[#c9a84c] bg-[#c9a84c] px-4 py-2 text-xs font-bold text-black disabled:opacity-45">{policyLoading ? 'APROBANDO…' : 'CONFIRMAR APROBACIÓN'}</button>
          <button onClick={() => { setPolicyModal(false); setPolicyNote('') }} className="border border-white/25 px-4 py-2 text-xs text-white/65">CANCELAR</button>
        </div>
      </div>
    </div>}
    <div className="border-b border-white/[0.08] p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-[10px] tracking-[.16em] text-[#c9a84c]" style={{ fontFamily: 'monospace' }}>SOURCE INTELLIGENCE OPERATIVO</p><h2 className="mt-2 text-2xl text-white">{source.display_name || source.canonical_source}</h2><p className="mt-1 text-xs text-white/45">{source.canonical_source} · {source.source_family || 'familia sin clasificar'} · certificado: {source.certified ? 'sí' : 'no'} · {source.implementation_state || 'NOT_IMPLEMENTED'} · último scan: {source.execution?.last_run ? new Date(source.execution.last_run).toLocaleString('es-PY') : 'sin evidencia'}</p></div>
        <div className="flex flex-wrap gap-2">
          {onAction && <button onClick={handleDiagnose} disabled={diagLoading} className="border border-white/25 px-4 py-3 text-xs text-white/65 disabled:opacity-45" style={{ fontFamily: 'monospace' }} title="Ejecuta diagnóstico de Eight Gates en tiempo real contra la DB">{diagLoading ? 'ANALIZANDO…' : 'ANALIZAR ESTADO'}</button>}
          {onAction && <button onClick={handleReconciliationPreview} disabled={diagLoading} className="border border-white/25 px-4 py-3 text-xs text-white/65 disabled:opacity-45" style={{ fontFamily: 'monospace' }}>PREVIEW INVENTARIO</button>}
          {onAction && <button onClick={() => handleReconciliationPreview('')} disabled={diagLoading} className="border border-white/15 px-4 py-3 text-xs text-white/45 disabled:opacity-45" style={{ fontFamily: 'monospace' }}>FUNNEL GLOBAL</button>}
          {reconciliationPreview && onAction && <button onClick={() => handleReconciliationApply(false)} disabled={diagLoading || reconciliationState === 'RUNNING'} className="border border-[#c9a84c]/60 px-4 py-3 text-xs text-[#c9a84c] disabled:opacity-45" style={{ fontFamily: 'monospace' }}>APLICAR RECONCILIACIÓN</button>}
          {(reconciliationResult?.resumable || (reconciliationPreview && reconciliationState === 'ERROR')) && onAction && <button onClick={() => handleReconciliationApply(true)} disabled={diagLoading} className="border border-amber-400/50 px-4 py-3 text-xs text-amber-300 disabled:opacity-45" style={{ fontFamily: 'monospace' }}>REANUDAR</button>}
          {source.execution?.telemetry_status === 'FAILED' && onAction && <button onClick={handleTelemetryRetry} disabled={diagLoading} className="border border-amber-400/50 px-4 py-3 text-xs text-amber-300 disabled:opacity-45" style={{ fontFamily: 'monospace' }}>REINTENTAR TELEMETRÍA</button>}
          {onRefresh && <button onClick={onRefresh} disabled={loading} className="border border-white/25 px-4 py-3 text-xs text-white/65 disabled:opacity-45" style={{ fontFamily: 'monospace' }} title={refreshedAt ? `Datos actualizados: ${new Date(refreshedAt).toLocaleString('es-PY')}` : 'Actualizar métricas sin ejecutar scraper'}>{loading ? 'ACTUALIZANDO…' : 'ACTUALIZAR DATOS'}</button>}
          {canScan
            ? <button onClick={() => onScan(source.canonical_source)} disabled={loading || scanStatus === 'QUEUED' || scanStatus === 'RUNNING'} className="border border-[#c9a84c] bg-[#c9a84c] px-5 py-3 text-xs font-bold text-black disabled:opacity-45" style={{ fontFamily: 'monospace' }}>{loading || scanStatus === 'QUEUED' || scanStatus === 'RUNNING' ? `ESCANEO ${scanStatus || 'INICIANDO'}…` : 'EJECUTAR ESCANEO'}</button>
            : <span className="border border-white/10 px-5 py-3 text-xs text-white/25" style={{ fontFamily: 'monospace' }} title="Escaneo manual no disponible para esta fuente">ESCANEO NO DISPONIBLE</span>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} placeholder="Buscar fuente..." className="border border-white/15 bg-black px-2 py-1 text-[10px] text-white/65 placeholder-white/25 focus:outline-none w-40" style={{ fontFamily: 'monospace' }} />
        {filteredSources.slice(0, 30).map(item => <button key={item.canonical_source} onClick={() => { onSelect(item.canonical_source); setSourceSearch('') }} className={`border px-2 py-1 text-[10px] ${item.canonical_source === source.canonical_source ? 'border-[#c9a84c] text-[#c9a84c]' : 'border-white/10 text-white/35'}`}>{item.display_name || item.canonical_source}</button>)}
        {filteredSources.length > 30 && <span className="text-[10px] text-white/25">+{filteredSources.length - 30} más</span>}
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div className="border border-white/10 px-3 py-2 text-white/60"><b className="block text-[9px] text-white/35">RUN ACTUAL</b>{isThisScan ? <span><b>{scanStatus}</b>{scan?.requestId ? ` · solicitud ${scan.requestId}` : ''}{run?.started_at ? ` · inició ${new Date(run.started_at).toLocaleString('es-PY')}` : ''}{scan?.error ? ` · ${scan.error}` : ''}{['QUEUED','RUNNING'].includes(String(scanStatus)) ? ' · esperando resultados de esta solicitud' : ''}</span> : <span>Sin solicitud activa.</span>}</div>
        <div className="border border-white/10 px-3 py-2 text-white/60"><b className="block text-[9px] text-white/35">ÚLTIMO RUN COMPLETADO</b>{history[0] ? `${history[0].started_at ? new Date(history[0].started_at).toLocaleString('es-PY') : '—'} · ${history[0].status} · encontradas ${number(history[0].found_count)} · procesadas ${number((history[0].inserted_count || 0) + (history[0].updated_count || 0) + (history[0].unchanged_count || 0))}` : 'Sin historial durable.'}</div>
      </div>
      {diagResult && <div className={`mt-3 border px-3 py-2 text-xs ${diagResult.overall_health === 'HEALTHY' ? 'border-green-900/40 text-green-400' : diagResult.overall_health === 'CRITICAL' ? 'border-red-900/40 text-red-400' : 'border-yellow-900/40 text-yellow-400'}`}>Diagnóstico: {diagResult.overall_health} · {diagResult.failing_gates} fallando · {diagResult.warning_gates} advertencias · {diagResult.inventory} oportunidades</div>}
      {reconciliationPreview && <div className="mt-3 border border-white/10 px-3 py-2 text-xs text-white/60">Preview inventario {reconciliationState}: {number(reconciliationPreview.total_examined)} examinadas · catálogo ready/efectivo {number(reconciliationPreview.catalog_ready)}/{number(reconciliationPreview.catalog_allowed)} · matching ready/efectivo {number(reconciliationPreview.matching_ready)}/{number(reconciliationPreview.matching_allowed)} · SEO ready/efectivo {number(reconciliationPreview.seo_ready)}/{number(reconciliationPreview.seo_allowed)} · embeddings {number(reconciliationPreview.embedding_ready)} listas, {number(reconciliationPreview.embedding_pending)} pendientes, {number(reconciliationPreview.embedding_failed)} fallidas, {number(reconciliationPreview.embedding_not_required)} no requeridas · solicitud {reconciliationPreview.reconciliation_id} · sin escrituras.</div>}
      {reconciliationResult && <div className="mt-3 border border-[#c9a84c]/30 px-3 py-2 text-xs text-white/65">Reconciliación {reconciliationResult.status}: {number(reconciliationResult.chunk?.examined)} examinadas · {number(reconciliationResult.chunk?.changed)} cambiadas · {number(reconciliationResult.chunk?.failed)} fallidas · cursor {number(reconciliationResult.cursor)} · {reconciliationResult.resumable ? 'podés reanudar.' : 'finalizada.'}</div>}
      {source.field_survival && <div className="mt-3 border border-white/10 px-3 py-2 text-xs text-white/55">Contrato de campos {source.field_survival.classification}: persistidos {number(Object.values(source.field_survival.fields || {}).filter((state: any) => state === 'PERSISTED').length)} · pérdidas {number(Object.values(source.field_survival.fields || {}).filter((state: any) => state === 'LOST_BEFORE_PERSISTENCE').length)} · desconocidos {number(Object.values(source.field_survival.fields || {}).filter((state: any) => state === 'UNKNOWN').length)}. Ver detalle técnico en Source Intelligence.</div>}
      {policyResult && <div className="mt-3 border border-white/10 px-3 py-2 text-xs text-white/60">Política: {policyResult.status === 'ok' ? '✓ Aprobada' : policyResult.status === 'blocked' ? `✕ Bloqueada: ${policyResult.reason}` : policyResult.reason}</div>}
    </div>

    <div className="grid gap-px border-b border-white/[0.08] bg-white/[0.08] md:grid-cols-4">{[['DISCOVERED', gates[0]?.metrics?.found], ['TRANSLATED', gates[1]?.metrics?.parsed], ['QUALITY PASS', gates[3]?.metrics?.description_ok], ['PERSISTENCE', gates[4]?.metrics?.description_ok]].map(([label, value]) => <div key={String(label)} className="bg-[#0b0b0b] p-3"><span className="block text-xl text-white">{number(value)}</span><span className="text-[9px] text-white/40" style={{ fontFamily: 'monospace' }}>{label}</span></div>)}</div>
    <div className="grid gap-2 p-5 md:grid-cols-2 xl:grid-cols-4">{gates.map((gate: any, index: number) => { const [icon, label] = visual(gate.status); return <article key={index} className="border border-white/[0.1] p-3"><div className="flex justify-between gap-2"><span className="text-[10px] text-white/40">{index + 1} · {gateNames[index]}</span><b className="text-xs text-white">{icon} {label}</b></div><p className="mt-3 text-xs text-white/65">{metric(gate)}</p><p className="mt-2 font-mono text-[10px] text-white/35">{gate.reason_code || 'UNKNOWN'}</p></article> })}</div>

    <div className="grid gap-4 border-y border-white/[0.08] p-5 lg:grid-cols-2"><div><h3 className="text-sm text-white">DIAGNÓSTICO GENERAL</h3><p className="mt-3 text-sm text-white/80">{report.headline}</p><p className="mt-2 text-xs leading-relaxed text-white/45">{report.detail}</p>{source.drift?.status === 'POSSIBLE_SOURCE_DRIFT' && <p className="mt-2 text-xs text-white/60">! POSIBLE CAMBIO EN LA FUENTE: caída frente al run anterior en {source.drift.signals.join(', ')}. Señal informativa; no bloquea por sí sola.</p>}</div><div><h3 className="text-sm text-white">RECOMENDACIÓN PRINCIPAL</h3><p className="mt-3 text-sm text-[#c9a84c]">{report.recommendation}</p><p className="mt-2 text-xs text-white/45">Las puertas posteriores bloqueadas no se recomiendan como causa raíz.</p></div></div>

    <div className="flex flex-wrap gap-2 border-b border-white/[0.08] px-5 py-3">{['RESULTADOS', 'PROBLEMAS', 'RECOMENDACIONES', 'HISTORIAL', 'SEO', 'LOGS'].map(item => <button key={item} onClick={() => setTab(item)} className={`px-2 py-1 text-[10px] ${tab === item ? 'border-b border-[#c9a84c] text-[#c9a84c]' : 'text-white/45'}`}>{item}</button>)}</div>
    <div className="p-5 text-xs text-white/55">
      {tab === 'RESULTADOS' && <>{!run ? <p>Ejecutá o seleccioná un scan para ver resultados atribuibles exclusivamente a esa ejecución.</p> : <><p className="mb-3">Resultados atribuibles al run {lineage?.run_id || run.run_id || 'sin id'}.</p><div className="overflow-auto"><table className="w-full text-left"><thead className="text-[10px] text-white/35"><tr><th>TÍTULO</th><th>ORGANIZACIÓN</th><th>UBICACIÓN</th><th>DESCRIPCIÓN</th><th>URLS</th><th>OUTCOME</th></tr></thead><tbody>{sourceRows.slice(0, 100).map((row: any) => <tr key={row.identity || row.opportunity_id} className="border-t border-white/[0.06]"><td className="py-2">{row.title || '—'}</td><td>{row.organization || '—'}</td><td>{row.location || '—'}</td><td>{row.description_length || 0}</td><td>{row.application_url ? 'apply ✓' : 'apply ✕'} · {row.source_url ? 'source ✓' : 'source ?'}</td><td>{rowOutcome(row)}{row.reason_code ? ` · ${row.reason_code}` : ''}</td></tr>)}</tbody></table></div></>}</>}
      {tab === 'PROBLEMAS' && <>{run && lineage?.issue_groups ? Object.entries(lineage.issue_groups).map(([reason, count]) => <div key={reason} className="mb-2 border border-white/[0.1] p-3"><b>{reason}</b><p className="mt-1">{number(count)} oportunidades afectadas · problema agrupado por causa, no por fila.</p></div>) : issues.length ? issues.map((gate: any) => <div key={gate.reason_code} className="mb-2 border border-white/[0.1] p-3"><b>{gate.reason_code || 'UNKNOWN'}</b><p className="mt-1">{metric(gate)} · problema agrupado por causa, no por fila.</p></div>) : <p>✓ No hay problemas técnicos agrupados por evidencia disponible.</p>}</>}
      {tab === 'RECOMENDACIONES' && <><p className="text-[#c9a84c]">{report.recommendation}</p>{issues.slice(1).map((gate: any) => <p key={gate.reason_code} className="mt-2">Secundaria: revisar {gate.reason_code}.</p>)}</>}
      {tab === 'HISTORIAL' && <>{history.length ? history.slice(0, 10).map((item: any) => <div key={item.id || item.run_id} className="flex flex-wrap justify-between gap-2 border-b border-white/[0.06] py-2"><span>{item.started_at ? new Date(item.started_at).toLocaleString('es-PY') : '—'} · {item.status}</span><span>found {number(item.found_count)} · valid {number(item.valid_count)} · persisted {number((item.inserted_count || 0) + (item.updated_count || 0))} · failed {number(item.error_count)}</span></div>) : <p>Sin historial durable.</p>}</>}
      {tab === 'SEO' && (() => {
        const seoGate = gates[7]
        const seiAllowed = source.distribution_policy?.search_engine_indexing_allowed ?? null
        const seoEnabled = source.seo_enabled ?? null
        const seoState = seoGate?.metrics?.surfaces?.organic_seo?.state || 'POLICY_NOT_DEFINED'
        const inventorySeo = source.pools?.seo ?? 0
        return <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border border-white/[0.08] p-3">
              <span className="block text-[9px] text-white/35" style={{ fontFamily: 'monospace' }}>POLICY (search_engine_indexing_allowed)</span>
              <span className={`mt-2 block text-sm font-bold ${seiAllowed === false ? 'text-red-400' : seiAllowed === true ? 'text-green-400' : 'text-white/45'}`}>
                {seiAllowed === false ? '✕ POLICY_DENIED' : seiAllowed === true ? '✓ ALLOWED' : '? LEGACY (null)'}
              </span>
              <p className="mt-1 text-[10px] text-white/35">{seiAllowed === false ? 'El contrato de fuente prohíbe indexación orgánica' : seiAllowed === true ? 'Política permite SEO (requiere seo_enabled)' : 'Comportamiento legado — rige seo_enabled DB'}</p>
            </div>
            <div className="border border-white/[0.08] p-3">
              <span className="block text-[9px] text-white/35" style={{ fontFamily: 'monospace' }}>DB FLAG (seo_enabled)</span>
              <span className={`mt-2 block text-sm font-bold ${seoEnabled === true ? 'text-green-400' : seoEnabled === false ? 'text-white/45' : 'text-white/25'}`}>
                {seoEnabled === true ? '✓ TRUE' : seoEnabled === false ? '— FALSE' : '? NULL'}
              </span>
            </div>
            <div className="border border-white/[0.08] p-3">
              <span className="block text-[9px] text-white/35" style={{ fontFamily: 'monospace' }}>GATE 8 ORGANIC_SEO</span>
              <span className={`mt-2 block text-sm font-bold ${seoState === 'ALLOWED' ? 'text-green-400' : seoState === 'POLICY_DENIED' ? 'text-red-400' : 'text-white/45'}`}>
                {seoState}
              </span>
              <p className="mt-1 text-[10px] text-white/35">{number(inventorySeo)} oportunidades con seo_eligible</p>
            </div>
          </div>
          {seiAllowed === false && <p className="border border-red-900/40 bg-red-950/20 p-3 text-red-400">Esta fuente tiene restricción explícita de SEO orgánico por contrato. No se puede habilitar seo_enabled para esta fuente.</p>}
          {seiAllowed === null && <div className="border border-white/10 p-3">
            <p className="text-white/45 text-xs">Política no definida (legado). Para habilitar SEO, primero aprobá la política de indexación.</p>
            {onAction && <button onClick={() => { setPolicyModal(true); setPolicyNote(''); setPolicyResult(null) }} className="mt-3 border border-[#c9a84c] px-4 py-2 text-xs text-[#c9a84c]" style={{ fontFamily: 'monospace' }}>APROBAR POLÍTICA SEO</button>}
          </div>}
          {seiAllowed === true && seoEnabled !== true && <div className="border border-white/10 p-3">
            <p className="text-green-400 text-xs">✓ Política SEO aprobada. Siguiente paso: habilitar seo_enabled via enable_seo_for_source.</p>
          </div>}
        </div>
      })()}
      {tab === 'LOGS' && <div><p>Eventos estructurados disponibles: DISCOVERY · DETAIL · FILTER · QUALITY · PERSISTENCE · OBSERVATION · AUTOMATION.</p><pre className="mt-3 max-h-56 overflow-auto border border-white/[0.08] p-3 text-[10px]">{JSON.stringify({ gates: gates.map((gate: any, index: number) => ({ stage: gateNames[index], status: gate.status, reason: gate.reason_code, metrics: gate.metrics })), last_run: source.execution }, null, 2)}</pre></div>}
    </div>
    {Object.keys(fields).length > 0 && <details className="border-t border-white/[0.08] p-5"><summary className="cursor-pointer text-xs text-white/55">Detalle de Gate 2 por campo</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(fields).map(([field, value]: any) => <div key={field} className="border border-white/[0.08] p-2"><b>{field}</b> · {value.extracted}/{value.total} · {value.state}</div>)}</div></details>}
  </section>
}

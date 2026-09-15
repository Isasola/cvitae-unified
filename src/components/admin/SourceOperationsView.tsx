import { useMemo, useState } from 'react'

type Props = {
  sources: any[]
  selectedSource: string | null
  onSelect: (source: string) => void
  onScan: (source: string) => void
  scan: { source?: string; status?: string; requestId?: string; error?: string; run?: any } | null
  loading?: boolean
}

const PILOTS = new Set(['unjobs', 'himalayas', 'talentcom', 'weworkremotely'])
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
  if (typeof m.allowed === 'number') return `${m.allowed} superficies permitidas`
  return 'Sin métrica durable'
}

export default function SourceOperationsView({ sources, selectedSource, onSelect, onScan, scan, loading }: Props) {
  const pilots = useMemo(() => sources.filter(source => PILOTS.has(source.canonical_source)), [sources])
  const source = pilots.find(item => item.canonical_source === selectedSource) || pilots[0]
  const [tab, setTab] = useState('RESULTADOS')
  if (!source) return <div className="mb-6 border border-white/[0.08] p-5 text-sm text-white/45">Source Intelligence todavía no devolvió fuentes piloto.</div>
  const gates = source.eight_gates?.gates || []
  const report = diagnosis(source)
  const history = source.history || []
  const isThisScan = scan?.source === source.canonical_source
  const scanStatus = isThisScan ? scan?.status : undefined
  const run = isThisScan ? scan?.run : null
  const issues = gates.filter((gate: any) => gate.status === 'FAIL' || gate.status === 'WARNING')
  const fields = gates[1]?.metrics?.fields || {}
  // Do not attribute the source inventory to a run. Only a durable manifest
  // emitted by that monitored run belongs in the Results tab.
  const lineage = run?.extraction_metrics?.scan_lineage
  const sourceRows = Array.isArray(lineage?.items) ? lineage.items : []
  const technicalFailure = gates.slice(0, 6).some((gate: any) => gate.status === 'FAIL')
  const policyBlocked = !technicalFailure && [gates[6], gates[7]].some((gate: any) => gate && ['NOT_APPLICABLE', 'NOT_EVALUATED'].includes(gate.status))
  const rowOutcome = (row: any) => row.persistence !== 'PERSISTED' ? '✕ FALLÓ' : technicalFailure ? '✕ FALLÓ' : row.description_length < 80 ? '! REQUIERE REVISIÓN' : policyBlocked ? '■ BLOQUEADA POR POLÍTICA' : '✓ LISTA PARA PIPELINE'
  return <section className="mb-7 border border-[#c9a84c]/25 bg-[#0b0b0b]">
    <div className="border-b border-white/[0.08] p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-[10px] tracking-[.16em] text-[#c9a84c]" style={{ fontFamily: 'monospace' }}>SOURCE INTELLIGENCE OPERATIVO</p><h2 className="mt-2 text-2xl text-white">{source.display_name || source.canonical_source}</h2><p className="mt-1 text-xs text-white/45">{source.canonical_source} · {source.source_family || 'familia sin clasificar'} · certificado: {source.certified ? 'sí' : 'no'} · último scan: {source.execution?.last_run ? new Date(source.execution.last_run).toLocaleString('es-PY') : 'sin evidencia'}</p></div>
        <button onClick={() => onScan(source.canonical_source)} disabled={loading || scanStatus === 'QUEUED' || scanStatus === 'RUNNING'} className="border border-[#c9a84c] bg-[#c9a84c] px-5 py-3 text-xs font-bold text-black disabled:opacity-45" style={{ fontFamily: 'monospace' }}>{loading || scanStatus === 'QUEUED' || scanStatus === 'RUNNING' ? `ESCANEO ${scanStatus || 'INICIANDO'}…` : 'EJECUTAR ESCANEO AHORA'}</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{pilots.map(item => <button key={item.canonical_source} onClick={() => onSelect(item.canonical_source)} className={`border px-3 py-2 text-xs ${item.canonical_source === source.canonical_source ? 'border-[#c9a84c] text-[#c9a84c]' : 'border-white/15 text-white/45'}`}>{item.display_name || item.canonical_source}</button>)}</div>
      {isThisScan && <div className="mt-4 border border-white/10 px-3 py-2 text-xs text-white/60">Ejecución: <b>{scanStatus}</b>{scan?.requestId ? ` · solicitud ${scan.requestId}` : ''}{run?.started_at ? ` · inició ${new Date(run.started_at).toLocaleString('es-PY')}` : ''}{scan?.error ? ` · ${scan.error}` : ''}</div>}
    </div>

    <div className="grid gap-px border-b border-white/[0.08] bg-white/[0.08] md:grid-cols-4">{[['DISCOVERED', gates[0]?.metrics?.found], ['TRANSLATED', gates[1]?.metrics?.parsed], ['QUALITY PASS', gates[3]?.metrics?.description_ok], ['PERSISTENCE', gates[4]?.metrics?.description_ok]].map(([label, value]) => <div key={String(label)} className="bg-[#0b0b0b] p-3"><span className="block text-xl text-white">{number(value)}</span><span className="text-[9px] text-white/40" style={{ fontFamily: 'monospace' }}>{label}</span></div>)}</div>
    <div className="grid gap-2 p-5 md:grid-cols-2 xl:grid-cols-4">{gates.map((gate: any, index: number) => { const [icon, label] = visual(gate.status); return <article key={index} className="border border-white/[0.1] p-3"><div className="flex justify-between gap-2"><span className="text-[10px] text-white/40">{index + 1} · {gateNames[index]}</span><b className="text-xs text-white">{icon} {label}</b></div><p className="mt-3 text-xs text-white/65">{metric(gate)}</p><p className="mt-2 font-mono text-[10px] text-white/35">{gate.reason_code || 'UNKNOWN'}</p></article> })}</div>

    <div className="grid gap-4 border-y border-white/[0.08] p-5 lg:grid-cols-2"><div><h3 className="text-sm text-white">DIAGNÓSTICO GENERAL</h3><p className="mt-3 text-sm text-white/80">{report.headline}</p><p className="mt-2 text-xs leading-relaxed text-white/45">{report.detail}</p>{source.drift?.status === 'POSSIBLE_SOURCE_DRIFT' && <p className="mt-2 text-xs text-white/60">! POSIBLE CAMBIO EN LA FUENTE: caída frente al run anterior en {source.drift.signals.join(', ')}. Señal informativa; no bloquea por sí sola.</p>}</div><div><h3 className="text-sm text-white">RECOMENDACIÓN PRINCIPAL</h3><p className="mt-3 text-sm text-[#c9a84c]">{report.recommendation}</p><p className="mt-2 text-xs text-white/45">Las puertas posteriores bloqueadas no se recomiendan como causa raíz.</p></div></div>

    <div className="flex flex-wrap gap-2 border-b border-white/[0.08] px-5 py-3">{['RESULTADOS', 'PROBLEMAS', 'RECOMENDACIONES', 'HISTORIAL', 'LOGS'].map(item => <button key={item} onClick={() => setTab(item)} className={`px-2 py-1 text-[10px] ${tab === item ? 'border-b border-[#c9a84c] text-[#c9a84c]' : 'text-white/45'}`}>{item}</button>)}</div>
    <div className="p-5 text-xs text-white/55">
      {tab === 'RESULTADOS' && <>{!run ? <p>Ejecutá o seleccioná un scan para ver resultados atribuibles exclusivamente a esa ejecución.</p> : <><p className="mb-3">Resultados atribuibles al run {lineage?.run_id || run.run_id || 'sin id'}.</p><div className="overflow-auto"><table className="w-full text-left"><thead className="text-[10px] text-white/35"><tr><th>TÍTULO</th><th>ORGANIZACIÓN</th><th>UBICACIÓN</th><th>DESCRIPCIÓN</th><th>URLS</th><th>OUTCOME</th></tr></thead><tbody>{sourceRows.slice(0, 100).map((row: any) => <tr key={row.identity || row.opportunity_id} className="border-t border-white/[0.06]"><td className="py-2">{row.title || '—'}</td><td>{row.organization || '—'}</td><td>{row.location || '—'}</td><td>{row.description_length || 0}</td><td>{row.application_url ? 'apply ✓' : 'apply ✕'} · {row.source_url ? 'source ✓' : 'source ?'}</td><td>{rowOutcome(row)}{row.reason_code ? ` · ${row.reason_code}` : ''}</td></tr>)}</tbody></table></div></>}</>}
      {tab === 'PROBLEMAS' && <>{run && lineage?.issue_groups ? Object.entries(lineage.issue_groups).map(([reason, count]) => <div key={reason} className="mb-2 border border-white/[0.1] p-3"><b>{reason}</b><p className="mt-1">{number(count)} oportunidades afectadas · problema agrupado por causa, no por fila.</p></div>) : issues.length ? issues.map((gate: any) => <div key={gate.reason_code} className="mb-2 border border-white/[0.1] p-3"><b>{gate.reason_code || 'UNKNOWN'}</b><p className="mt-1">{metric(gate)} · problema agrupado por causa, no por fila.</p></div>) : <p>✓ No hay problemas técnicos agrupados por evidencia disponible.</p>}</>}
      {tab === 'RECOMENDACIONES' && <><p className="text-[#c9a84c]">{report.recommendation}</p>{issues.slice(1).map((gate: any) => <p key={gate.reason_code} className="mt-2">Secundaria: revisar {gate.reason_code}.</p>)}</>}
      {tab === 'HISTORIAL' && <>{history.length ? history.slice(0, 10).map((item: any) => <div key={item.id || item.run_id} className="flex flex-wrap justify-between gap-2 border-b border-white/[0.06] py-2"><span>{item.started_at ? new Date(item.started_at).toLocaleString('es-PY') : '—'} · {item.status}</span><span>found {number(item.found_count)} · valid {number(item.valid_count)} · persisted {number((item.inserted_count || 0) + (item.updated_count || 0))} · failed {number(item.error_count)}</span></div>) : <p>Sin historial durable.</p>}</>}
      {tab === 'LOGS' && <div><p>Eventos estructurados disponibles: DISCOVERY · DETAIL · FILTER · QUALITY · PERSISTENCE · OBSERVATION · AUTOMATION.</p><pre className="mt-3 max-h-56 overflow-auto border border-white/[0.08] p-3 text-[10px]">{JSON.stringify({ gates: gates.map((gate: any, index: number) => ({ stage: gateNames[index], status: gate.status, reason: gate.reason_code, metrics: gate.metrics })), last_run: source.execution }, null, 2)}</pre></div>}
    </div>
    {Object.keys(fields).length > 0 && <details className="border-t border-white/[0.08] p-5"><summary className="cursor-pointer text-xs text-white/55">Detalle de Gate 2 por campo</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(fields).map(([field, value]: any) => <div key={field} className="border border-white/[0.08] p-2"><b>{field}</b> · {value.extracted}/{value.total} · {value.state}</div>)}</div></details>}
  </section>
}

export interface RegistrySource { source_id: string; script: string; source_tier?: string; status?: string }

export function workflowEntries(workflow: string) {
  const entries: Array<{ scraper_id: string; script: string }> = []
  const pattern = /run_scraper_monitored\.py\s+(\S+)\s+\S+\s+(\S+)/g
  for (const match of workflow.matchAll(pattern)) entries.push({ scraper_id: match[1], script: match[2].replace(/\\/g, '/') })
  return entries
}

function normalizeId(value: string): string {
  return String(value || '').replace(/_scraper$/, '')
}

export function reconcileSources(registry: RegistrySource[], workflow: string, controls: any[], policies: any[]) {
  const workflowRows = workflowEntries(workflow)
  const keys = new Set<string>([
    ...registry.map(row => normalizeId(row.source_id)),
    ...workflowRows.map(row => normalizeId(row.scraper_id)),
    ...controls.map(row => normalizeId(row.scraper_id)),
    ...policies.map(row => normalizeId(row.source)),
  ])
  return [...keys].map(key => {
    const registryRow = registry.find(row => normalizeId(row.source_id) === key)
    const workflowRow = workflowRows.find(row => normalizeId(row.scraper_id) === key || (registryRow && row.script === registryRow.script))
    const control = controls.find(row => normalizeId(row.scraper_id) === key || (workflowRow && String(row.script_path).replace(/\\/g, '/') === workflowRow.script))
    const policy = policies.find(row => normalizeId(row.source) === key || row.source === registryRow?.source_id)
    return {
      key,
      registry_id: registryRow?.source_id || null,
      registry_tier: registryRow?.source_tier || null,
      registry_status: registryRow?.status || null,
      workflow_scraper_id: workflowRow?.scraper_id || null,
      runtime_scraper_id: control?.scraper_id || null,
      source_policy: policy?.source || null,
      in_registry: Boolean(registryRow),
      in_workflow: Boolean(workflowRow),
      in_runtime: Boolean(control),
      collection_enabled: control?.collection_enabled === true,
      require_review: control?.require_review !== false,
      last_run_at: control?.last_run_at || null,
      last_run_status: control?.last_run_status || null,
      quality_status: control?.quality_status || null,
      error: control?.last_error_summary || null,
      blocked_reason: control?.paused_reason || null,
    }
  }).sort((a, b) => Number(a.in_registry && a.in_workflow && a.in_runtime) - Number(b.in_registry && b.in_workflow && b.in_runtime) || a.key.localeCompare(b.key))
}

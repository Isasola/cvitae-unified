const STORAGE_KEY = 'cvitae_pending_credit_operations'

function read(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function pendingOperationId(scope: 'single' | 'batch', fingerprint: string): string {
  const key = `${scope}:${fingerprint}`
  const operations = read()
  if (operations[key]) return operations[key]
  const operationId = `${scope}:${crypto.randomUUID()}`
  operations[key] = operationId
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(operations))
  return operationId
}

export function clearPendingOperation(operationId: string): void {
  const operations = read()
  for (const [key, value] of Object.entries(operations)) {
    if (value === operationId) delete operations[key]
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(operations))
}

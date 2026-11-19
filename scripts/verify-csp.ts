import { readFileSync } from 'node:fs'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function parseCsp(path: string) {
  const source = readFileSync(path, 'utf8')
  const match = source.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)
  assert(match, `No se encontro Content-Security-Policy en ${path}`)

  return new Map(match[1].split(';').map(rawDirective => {
    const tokens = rawDirective.trim().split(/\s+/)
    return [tokens[0], tokens.slice(1)]
  }))
}

function requireSources(directives: Map<string, string[]>, directive: string, expected: string[]) {
  const sources = directives.get(directive)
  assert(sources, `Falta la directiva ${directive}`)
  for (const source of expected) {
    assert(sources.includes(source), `${directive} debe preservar ${source}`)
  }
}

const generated = process.argv.includes('--generated')
const path = generated ? '.netlify/netlify.toml' : 'netlify.toml'
const directives = parseCsp(path)

requireSources(directives, 'default-src', ["'self'"])
requireSources(directives, 'script-src', [
  "'self'",
  "'unsafe-inline'",
  'https://pagead2.googlesyndication.com',
  'https://partner.googleadservices.com',
  'https://tpc.googlesyndication.com',
  'https://www.googletagmanager.com',
])
requireSources(directives, 'style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'])
requireSources(directives, 'img-src', ["'self'", 'data:', 'https:'])
requireSources(directives, 'connect-src', [
  "'self'",
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://www.googletagmanager.com',
])
requireSources(directives, 'font-src', ["'self'", 'data:', 'https://fonts.gstatic.com'])
requireSources(directives, 'frame-src', [
  'https://googleads.g.doubleclick.net',
  'https://tpc.googlesyndication.com',
])
requireSources(directives, 'object-src', ["'none'"])
requireSources(directives, 'base-uri', ["'self'"])

const allSources = [...directives.values()].flat()
assert(!allSources.includes('*'), 'La CSP no debe incluir un wildcard global')
assert(!allSources.includes("'unsafe-eval'"), "La CSP no debe habilitar 'unsafe-eval'")
assert(!directives.has('script-src-elem'), 'Este hotfix debe conservar la politica unica de script-src')

console.log(`CSP ${generated ? 'generada por Netlify' : 'fuente'}: 10 controles focalizados superados.`)

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')

if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true })

const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /auth/callback
Disallow: /mi-carrera/configuracion

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Googlebot
Allow: /
Crawl-delay: 1

Sitemap: https://cvitae.lat/sitemap.xml
`

fs.writeFileSync(path.join(distPath, 'robots.txt'), robots)
console.log('✅ robots.txt generado para cvitae.lat')

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
Disallow: /mi-carrera/

User-agent: GPTBot
Allow: /
Disallow: /admin
Disallow: /mi-carrera/

User-agent: ChatGPT-User
Allow: /
Disallow: /admin
Disallow: /mi-carrera/

User-agent: Claude-Web
Allow: /
Disallow: /admin
Disallow: /mi-carrera/

User-agent: PerplexityBot
Allow: /
Disallow: /admin
Disallow: /mi-carrera/

User-agent: Googlebot
Allow: /
Disallow: /admin
Disallow: /mi-carrera/
Crawl-delay: 1

Sitemap: https://cvitae.lat/sitemap.xml
`

fs.writeFileSync(path.join(distPath, 'robots.txt'), robots)
console.log('✅ robots.txt generado para cvitae.lat')

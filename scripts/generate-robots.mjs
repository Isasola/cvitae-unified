import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
const robotsPath = path.join(distPath, 'robots.txt')

if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true })

const robots = `User-agent: *
Allow: /
Disallow: /admin
Sitemap: https://cvitae-py.netlify.app/sitemap.xml
`
fs.writeFileSync(robotsPath, robots)
console.log('✅ robots.txt generado')

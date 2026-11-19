import assert from 'node:assert/strict'
import { expandSitemapLocs } from './audit-indexability.mjs'

const root = '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://cvitae.lat/sitemap-opportunities/1.xml</loc></sitemap><sitemap><loc>https://cvitae.lat/sitemap-vacancies.xml</loc></sitemap></sitemapindex>'
const children = [
  '<urlset><url><loc>https://cvitae.lat/empleos/role</loc></url><url><loc>https://cvitae.lat/oportunidades/grant</loc></url></urlset>',
  '<urlset><url><loc>https://cvitae.lat/vacante/opening</loc></url></urlset>',
]
assert.deepEqual(expandSitemapLocs(root, children), [
  'https://cvitae.lat/empleos/role',
  'https://cvitae.lat/oportunidades/grant',
  'https://cvitae.lat/vacante/opening',
])
assert.deepEqual(expandSitemapLocs('<urlset><url><loc>https://cvitae.lat/blog/post</loc></url></urlset>'), ['https://cvitae.lat/blog/post'])
console.log('verify_audit_indexability_item53: PASS sitemap-index children opportunity blog vacancy discovery')

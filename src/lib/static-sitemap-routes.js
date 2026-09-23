/** Explicit public/indexable static routes shared by build and runtime sitemaps. */
export const STATIC_PUBLIC_SITEMAP_ROUTES = [
  { url: '/', priority: '1.0', freq: 'daily' },
  { url: '/empleos', priority: '0.9', freq: 'daily' },
  { url: '/oportunidades', priority: '0.9', freq: 'daily' },
  { url: '/oportunidades/paraguay', priority: '0.8', freq: 'daily' },
  { url: '/oportunidades/latam', priority: '0.8', freq: 'weekly' },
  { url: '/blog', priority: '0.8', freq: 'weekly' },
  { url: '/sobre-cvitae', priority: '0.6', freq: 'monthly' },
  { url: '/privacy', priority: '0.3', freq: 'monthly' },
  { url: '/terminos', priority: '0.3', freq: 'yearly' },
  { url: '/cookies', priority: '0.3', freq: 'yearly' },
]

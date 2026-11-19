/** react-helmet-async 3 uses React 19 native HEAD, not legacy updateTags.
 * data-rh identifies the initial detail snapshot until the live HEAD commits.
 */
export const PUBLIC_DETAIL_HEAD_MARKER = 'data-rh'

export function publicDetailDescription(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
}

export function withPublicDetailHead(template, metadata) {
  const managed = metadata.replace(/<(title|meta|link|script)\b/g, `<$1 ${PUBLIC_DETAIL_HEAD_MARKER}="true"`)
  return template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\b[^>]*(?:\bname=["'](?:description|robots|twitter:[^"']+)["']|\bproperty=["']og:[^"']+["'])[^>]*>/gi, '')
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace('</head>', `${managed}</head>`)
}

/** Called after the live Helmet HEAD commits; assets and unmarked tags stay. */
export function releaseInitialPublicDetailHead() {
  document.head.querySelectorAll(`[${PUBLIC_DETAIL_HEAD_MARKER}="true"]`).forEach(tag => tag.remove())
}

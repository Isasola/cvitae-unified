import type { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const SITE_URL = "https://cvitae.lat"
const JOB_TYPES = new Set(["job", "internship", "consultancy"])

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`
}

export const handler: Handler = async () => {
  try {
    const supabase = makeSupabaseAdmin()
    const today = new Date().toISOString().split("T")[0]
    const nowIso = new Date().toISOString()

    // Active verified catalog-eligible opportunities, not deleted, not archived
    const { data: opps } = await supabase
      .from("opportunities")
      .select("slug, opportunity_type, updated_at, deadline")
      .eq("is_active", true)
      .eq("verification_status", "verified")
      .eq("catalog_eligible", true)
      .is("deleted_at", null)
      .is("archived_at", null)
      .not("slug", "is", null)
      .order("updated_at", { ascending: false })
      .limit(2000)

    // Blog posts from content_hub
    const { data: blogPosts } = await supabase
      .from("content_hub")
      .select("slug, created_at")
      .eq("tipo", "blog")
      .eq("is_active", true)
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(500)

    // Legacy oportunidades from content_hub — KEEP only: active, not expired, has content
    // Audit result (2026-08-18): 1,701 total, 1,379 expired, only ~51 qualify as KEEP
    // Filter: fecha_vencimiento NULL (no deadline = evergreen) OR still in future
    const { data: legacyOpps } = await supabase
      .from("content_hub")
      .select("slug, created_at, cuerpo")
      .in("tipo", ["oportunidad", "empleo", "beca"])
      .eq("is_active", true)
      .not("slug", "is", null)
      .or(`fecha_vencimiento.is.null,fecha_vencimiento.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(300)

    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

    // Static pages
    const staticPages = [
      { url: "/", priority: "1.0", freq: "daily" },
      { url: "/empleos", priority: "0.9", freq: "daily" },
      { url: "/oportunidades", priority: "0.9", freq: "daily" },
      { url: "/blog", priority: "0.8", freq: "weekly" },
      { url: "/sobre-cvitae", priority: "0.6", freq: "monthly" },
      { url: "/privacy", priority: "0.3", freq: "yearly" },
      { url: "/terminos", priority: "0.3", freq: "yearly" },
    ]
    for (const p of staticPages) {
      sitemap += urlEntry(`${SITE_URL}${p.url}`, today, p.freq, p.priority)
    }

    // Opportunities — deduplicated by slug+prefix, expired excluded
    const seenSlugs = new Set<string>()
    for (const opp of opps || []) {
      if (!opp.slug) continue
      // Exclude expired (deadline in the past)
      if (opp.deadline && opp.deadline < nowIso) continue
      const isJob = JOB_TYPES.has(opp.opportunity_type || "")
      const prefix = isJob ? "/empleos" : "/oportunidades"
      const key = `${prefix}/${opp.slug}`
      if (seenSlugs.has(key)) continue
      seenSlugs.add(key)
      const lastmod = (opp.updated_at || today).split("T")[0]
      const priority = isJob ? "0.8" : "0.7"
      sitemap += urlEntry(`${SITE_URL}${key}`, lastmod, "weekly", priority)
    }

    // Blog posts
    const seenBlogSlugs = new Set<string>()
    for (const post of blogPosts || []) {
      if (!post.slug) continue
      if (seenBlogSlugs.has(post.slug)) continue
      seenBlogSlugs.add(post.slug)
      const lastmod = (post.created_at || today).split("T")[0]
      sitemap += urlEntry(`${SITE_URL}/blog/${post.slug}`, lastmod, "weekly", "0.6")
    }

    // Legacy content_hub oportunidades — KEEP only: not expired + body ≥ 100 chars
    // Thin content is excluded (crawled-not-indexed risk)
    const seenLegacySlugs = new Set<string>()
    for (const opp of legacyOpps || []) {
      if (!opp.slug) continue
      if (!opp.cuerpo || opp.cuerpo.length < 100) continue
      const key = `/oportunidades/${opp.slug}`
      if (seenSlugs.has(key) || seenLegacySlugs.has(opp.slug)) continue
      seenLegacySlugs.add(opp.slug)
      const lastmod = (opp.created_at || today).split("T")[0]
      sitemap += urlEntry(`${SITE_URL}${key}`, lastmod, "monthly", "0.5")
    }

    sitemap += "</urlset>"

    const totalUrls = staticPages.length + seenSlugs.size + seenBlogSlugs.size + seenLegacySlugs.size
    console.log(`[sitemap] generated ${totalUrls} URLs (${seenSlugs.size} opps, ${seenBlogSlugs.size} blog, ${seenLegacySlugs.size} legacy)`)

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
      body: sitemap,
    }
  } catch (err) {
    console.error("[sitemap] error", err)
    return {
      statusCode: 500,
      body: "<!-- sitemap generation failed -->",
    }
  }
}

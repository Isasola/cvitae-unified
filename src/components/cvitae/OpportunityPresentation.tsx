import { useId, useState, type ReactNode } from 'react'
import { Building2, CalendarDays, ChevronDown, ExternalLink, MapPin, Sparkles } from 'lucide-react'
import { Link } from 'wouter'
import { safeExternalUrl } from '@/lib/safe-url'
import { analytics } from '@/lib/analytics'

type StructuredItem = { text: string; category?: string }
export type OpportunityPresentationRow = {
  slug: string; title: string; organization?: string | null; location?: string | null; type?: string | null; deadline?: string | null; description?: string | null; source?: string | null; source_url?: string | null; application_url?: string | null; sourceAttributionRequired?: boolean
  tags?: string[] | null; requirements?: StructuredItem[] | null; responsibilities?: StructuredItem[] | null; benefits?: StructuredItem[] | null
  duration_text?: string | null; start_date?: string | null; start_date_text?: string | null; employment_type?: string | null
  facts?: Array<{ label: string; value: string | null | undefined }>
}
const text = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
export function formatOpportunityDate(value: unknown) {
  const raw = text(value); if (!raw) return ''
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  const parsed = dateOnly ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)) : new Date(raw)
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : {}) })
}
export function formatOpportunityValue(value: unknown, label = '') {
  const raw = text(value); if (!raw) return ''
  if (label === 'Tipo') return ({ full_time: 'Tiempo completo', part_time: 'Medio tiempo', contract: 'Contrato', temporary: 'Temporal', internship: 'Pasantía', volunteer: 'Voluntariado', consultancy: 'Consultoría', other: 'Otro', remote: 'Remoto', hybrid: 'Híbrido' } as Record<string, string>)[raw.toLowerCase()] || raw.replaceAll('_', ' ')
  if (label === 'Fecha límite' || label === 'Inicio') return formatOpportunityDate(raw)
  return raw
}

export function OpportunityFacts({ row, facts: extraFacts = [] }: { row: OpportunityPresentationRow; facts?: Array<{ label: string; value: string | null | undefined }> }) {
  const facts = [
    { label: 'Organización', value: formatOpportunityValue(row.organization, 'Organización'), icon: Building2 },
    { label: 'Lugar', value: formatOpportunityValue(row.location, 'Lugar'), icon: MapPin },
    { label: 'Tipo', value: formatOpportunityValue(row.employment_type || row.type, 'Tipo'), icon: Sparkles },
    { label: 'Fecha límite', value: formatOpportunityValue(row.deadline, 'Fecha límite'), icon: CalendarDays },
    ...(row.tags?.length ? [{ label: 'Áreas clave', value: row.tags.join(' · ') }] : []), ...(row.facts || []), ...extraFacts,
  ].map(fact => ({ ...fact, value: formatOpportunityValue(fact.value, fact.label), icon: 'icon' in fact ? fact.icon : null })).filter(fact => fact.value)
  if (!facts.length) return null
  return <section aria-label="Esta oportunidad en 30 segundos" className="mt-7"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c9a84c]">Esta oportunidad en 30 segundos</p><dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{facts.map(fact => <div key={`${fact.label}-${fact.value}`} className="border-l border-white/10 pl-3"><dt className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/35">{fact.icon && <fact.icon className="h-3.5 w-3.5 text-[#c9a84c]" />}{fact.label}</dt><dd className="mt-1 text-sm leading-5 text-cream">{fact.value}</dd></div>)}</dl></section>
}

export function StructuredOpportunityDescription({ description, requirements, responsibilities, benefits, heading = 'Información de la oportunidad' }: { description?: string | null; requirements?: StructuredItem[] | null; responsibilities?: StructuredItem[] | null; benefits?: StructuredItem[] | null; heading?: string }) {
  const value = text(description); const [open, setOpen] = useState(false); const contentId = useId()
  const sections: Array<[string, StructuredItem[]]> = [['Qué buscan', requirements || []], ['Qué harías', responsibilities || []], ['Beneficios', benefits || []]].map(([title, items]) => [title, items.filter(item => text(item.text))] as [string, StructuredItem[]]).filter(([, items]) => items.length)
  return <section className="mt-10 border-t border-white/8 pt-8"><h2 className="font-display text-2xl text-cream">{heading}</h2><p className="mt-3 text-sm text-white/45">Una lectura ordenada de la convocatoria para que puedas decidir con mejor contexto.</p>{sections.length > 0 && <div className="mt-6 space-y-7">{sections.map(([title, items]) => <section key={title}><h3 className="text-sm font-semibold text-cream">{title}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-white/60">{items.map((item, index) => <li key={`${title}-${index}`}>{text(item.text)}{item.category && <span className="ml-2 text-xs text-white/35">({text(item.category)})</span>}</li>)}</ul></section>)}</div>}<div className="mt-7 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.018]"><button type="button" className="flex min-h-12 w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium text-[#c9a84c]" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}><span>{open ? 'Ocultar descripción original' : 'Ver descripción original completa'}</span><ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} /></button>{open && <div id={contentId} className="border-t border-white/8 px-4 pb-5 pt-4"><p className="whitespace-pre-line text-sm leading-7 text-white/60">{value || 'La fuente no proporcionó una descripción completa. Revisá las bases antes de postular.'}</p></div>}</div></section>
}

export function CvitaeOpportunityValue() { const steps = [['Entendemos la oportunidad', 'Organizamos requisitos, habilidades, condiciones y responsabilidades reales.'], ['La comparamos con vos', 'Contrastamos la convocatoria con tu perfil y tu CV.'], ['Detectamos evidencia y brechas', 'Separamos lo respaldado de lo que todavía no podemos confirmar.'], ['Adaptamos tu CV', 'Priorizamos y redactamos mejor evidencia real relevante para el puesto.'], ['Preparás tu postulación', 'Revisás todo antes de abrir el formulario oficial.']]; return <section className="mt-10 rounded-3xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.04] p-6 sm:p-8"><p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a84c]">Cómo CVitae puede ayudarte</p><h2 className="mt-3 max-w-2xl font-display text-2xl text-cream sm:text-3xl">Prepará mejor tu postulación, <em className="font-normal">sin inventar experiencia.</em></h2><p className="mt-4 max-w-2xl text-sm leading-6 text-white/55">Comparamos esta oportunidad con tu perfil, identificamos qué requisitos podés respaldar y preparamos una versión de tu CV orientada al puesto <strong className="text-[#e4ca7e]">SIN INVENTAR EXPERIENCIA</strong>.</p><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{steps.map(([title, body], index) => <div key={title} className="border-l border-[#c9a84c]/35 pl-4"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e4ca7e]">0{index + 1}</p><h3 className="mt-2 text-sm font-semibold text-cream">{title}</h3><p className="mt-1 text-xs leading-5 text-white/45">{body}</p></div>)}</div><div className="mt-7 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#e4ca7e]"><span className="rounded-full border border-[#c9a84c]/30 px-3 py-1">EVIDENCIA CONFIRMADA</span><span className="rounded-full border border-[#c9a84c]/30 px-3 py-1">REQUISITOS REALES</span><span className="rounded-full border border-[#c9a84c]/30 px-3 py-1">TU EXPERIENCIA</span></div></section> }
export function OpportunityApplicationCta({ slug, children = 'Preparar mi postulación', opportunityId, source, opportunityKind, routeFamily }: { slug: string; children?: ReactNode; opportunityId?: string; source?: string | null; opportunityKind?: string | null; routeFamily?: string }) { return <Link href={`/mi-carrera/postular/${encodeURIComponent(slug)}`} onClick={() => analytics.prepareClicked({ opportunity_id: opportunityId, opportunity_slug: slug, source: source || undefined, opportunity_kind: opportunityKind || undefined, route_family: routeFamily })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c9a84c] px-4 py-3 text-sm font-semibold text-[#090909] transition hover:bg-[#dfc36e]">{children}<Sparkles className="h-4 w-4" /></Link> }
export function OpportunitySourceBlock({ row }: { row: OpportunityPresentationRow }) { const source = text(row.source); if (!row.sourceAttributionRequired && !row.source_url && !source) return null; return <div className="mt-6 border-t border-white/8 pt-4 text-xs leading-relaxed text-white/40"><p>{source ? `Fuente: ${source}` : 'Fuente original'}</p>{row.sourceAttributionRequired && row.source_url && <a href={safeExternalUrl(row.source_url)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[#c9a84c] hover:underline">Ver fuente original <ExternalLink className="h-3 w-3" /></a>}</div> }

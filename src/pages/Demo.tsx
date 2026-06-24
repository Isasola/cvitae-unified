import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'wouter'
import {
  User, Building2, CheckCircle2, XCircle, AlertCircle,
  Star, TrendingUp, BookOpen, Briefcase, ArrowRight,
  BarChart3, Users, FileText, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { Eyebrow, GrowthLine } from '@/components/cv/visuals'

const ease = [0.22, 1, 0.36, 1] as const

// ─── Datos demo B2C ───────────────────────────────────────────────────────────

const demoCandidate = {
  name: 'Gabriela Romero',
  title: 'Técnica en Administración de Empresas',
  location: 'Asunción, Paraguay',
  seniority: 'Semi-Senior',
  score: 71,
  skills: ['Excel', 'Atención al cliente', 'SAP básico', 'Gestión de cobros', 'Guaraní nativo'],
  missingSkills: ['Power BI', 'Inglés intermedio', 'ERP avanzado'],
  route: 'Empleo en empresas locales',
}

const demoMatches = [
  {
    org: 'Banco Continental',
    title: 'Analista de Operaciones Jr.',
    location: 'Asunción',
    type: 'Empleo',
    score: 84,
    tags: ['Presencial', 'Banca'],
  },
  {
    org: 'Tigo Paraguay',
    title: 'Asistente Comercial',
    location: 'Asunción',
    type: 'Empleo',
    score: 79,
    tags: ['Presencial', 'Telecomunicaciones'],
  },
  {
    org: 'IPS',
    title: 'Auxiliar Administrativo',
    location: 'Asunción',
    type: 'Empleo',
    score: 73,
    tags: ['Sector público'],
  },
  {
    org: 'Remotive',
    title: 'Operations Assistant (Remote)',
    location: 'Remoto',
    type: 'Remoto',
    score: 61,
    tags: ['Remoto', 'USD'],
  },
]

const demoCourses = [
  { skill: 'Power BI', course: 'Power BI para principiantes', platform: 'Udemy', impact: '+18% posibilidades en finanzas' },
  { skill: 'Inglés', course: 'English for Business B1–B2', platform: 'Coursera', impact: '+31% para roles remotos' },
]

// ─── Datos demo B2B ───────────────────────────────────────────────────────────

const demoCVs = [
  {
    name: 'Carlos Méndez',
    title: 'Lic. en Marketing — 4 años en ventas B2B',
    company: 'Ex-Tigo Paraguay',
    ats: 88,
    fit: 91,
    rec: 'Llamar',
    strengths: ['Experiencia en telco', 'KPIs de ventas documentados', 'Inglés avanzado'],
    gaps: ['Sin experiencia en canal retail'],
    badge: 'Atención al Cliente',
  },
  {
    name: 'Lucía Ferreira',
    title: 'Técnica en RRHH — 2 años atención al cliente',
    company: 'Ex-Atento Paraguay',
    ats: 74,
    fit: 78,
    rec: 'Considerar',
    strengths: ['Manejo de objeciones', 'Call center certificado'],
    gaps: ['Sin experiencia en ventas directas', 'CV sin métricas'],
    badge: null,
  },
  {
    name: 'Diego Ortiz',
    title: 'Estudiante universitario — sin experiencia formal',
    company: 'UNA',
    ats: 41,
    fit: 38,
    rec: 'No llamar',
    strengths: ['Perfil joven con potencial'],
    gaps: ['Sin experiencia laboral', 'CV básico', 'Sin habilidades técnicas requeridas'],
    badge: null,
  },
  {
    name: 'María González',
    title: 'Vendedora Senior — 6 años en retail',
    company: 'Ex-SuperSeis',
    ats: 82,
    fit: 85,
    rec: 'Llamar',
    strengths: ['Cierre de ventas probado', 'Tolerancia a frustración alta', 'Guaraní/español nativo'],
    gaps: ['Sin experiencia en sector servicios'],
    badge: 'Ventas',
  },
  {
    name: 'Andrés Villalba',
    title: 'Bachiller Técnico — experiencia informal',
    company: 'Trabajos freelance',
    ats: 52,
    fit: 49,
    rec: 'Considerar',
    strengths: ['Disponibilidad inmediata', 'Actitud proactiva'],
    gaps: ['CV sin formato ATS', 'Sin referencias formales'],
    badge: null,
  },
]

const recColors: Record<string, string> = {
  'Llamar': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  'Considerar': 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  'No llamar': 'text-red-400 bg-red-400/10 border-red-400/20',
}

const recIcon: Record<string, JSX.Element> = {
  'Llamar': <CheckCircle2 className="w-4 h-4" />,
  'Considerar': <AlertCircle className="w-4 h-4" />,
  'No llamar': <XCircle className="w-4 h-4" />,
}

// ─── Tab B2C ──────────────────────────────────────────────────────────────────

function TabCandidato() {
  return (
    <div className="space-y-8">
      {/* Perfil + score */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="editorial-panel p-6 lg:col-span-1">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#c9a84c] to-[#e8c97a] flex items-center justify-center text-xl font-bold text-[#0a0a0a]">
              GR
            </div>
            <div>
              <p className="font-semibold text-cream">{demoCandidate.name}</p>
              <p className="text-sm text-white/60">{demoCandidate.title}</p>
              <p className="text-xs text-white/40">{demoCandidate.location} · {demoCandidate.seniority}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-white/50 uppercase tracking-widest">Habilidades</p>
            <div className="flex flex-wrap gap-2">
              {demoCandidate.skills.map(s => (
                <span key={s} className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/70">{s}</span>
              ))}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-white/50 uppercase tracking-widest">Ruta de carrera</p>
            <span className="text-xs px-2 py-1 rounded-full bg-[#c9a84c]/10 border border-[#c9a84c]/20 text-[#c9a84c]">{demoCandidate.route}</span>
          </div>
        </div>

        <div className="gold-panel p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <p className="text-xs text-white/50 uppercase tracking-widest mb-1">Score de Empleabilidad</p>
            <div className="flex items-end gap-3">
              <span className="font-display text-6xl text-[#c9a84c]">{demoCandidate.score}</span>
              <span className="text-white/40 text-xl mb-2">/100</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${demoCandidate.score}%` }}
                transition={{ duration: 1.2, ease }}
                className="h-full rounded-full bg-gradient-to-r from-[#c9a84c] to-[#e8c97a]"
              />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-2xl font-semibold text-cream">{demoMatches.length}</p>
              <p className="text-xs text-white/50">matches activos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-cream">3</p>
              <p className="text-xs text-white/50">skills a mejorar</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-cream">84%</p>
              <p className="text-xs text-white/50">mejor match</p>
            </div>
          </div>
        </div>
      </div>

      {/* Oportunidades matcheadas */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-widest mb-3">Oportunidades recomendadas</p>
        <div className="space-y-3">
          {demoMatches.map((m, i) => (
            <motion.div
              key={m.title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07, duration: 0.5, ease }}
              className="editorial-panel p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-cream truncate">{m.title}</p>
                <p className="text-sm text-white/50">{m.org} · {m.location}</p>
                <div className="flex gap-1 mt-1">
                  {m.tags.map(t => (
                    <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-white/40">{t}</span>
                  ))}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-lg font-bold ${m.score >= 80 ? 'text-[#c9a84c]' : m.score >= 65 ? 'text-white' : 'text-white/50'}`}>
                  {m.score}%
                </div>
                <p className="text-xs text-white/40">compatibilidad</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Cursos recomendados */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-widest mb-3">Cursos sugeridos por IA</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {demoCourses.map((c) => (
            <div key={c.skill} className="glass-panel p-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-[#c9a84c]" />
                <span className="text-xs text-[#c9a84c] font-medium">{c.skill}</span>
              </div>
              <p className="font-medium text-cream text-sm">{c.course}</p>
              <p className="text-xs text-white/50 mt-1">{c.platform}</p>
              <p className="text-xs text-emerald-400 mt-2">{c.impact}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center pt-4">
        <p className="text-white/40 text-sm mb-4">Tu perfil real puede verse así en menos de 2 minutos</p>
        <Link href="/#registro">
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a84c] px-8 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] cursor-pointer">
            Crear mi perfil gratis <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </div>
  )
}

// ─── Tab B2B ──────────────────────────────────────────────────────────────────

function TabEmpresa() {
  const [expanded, setExpanded] = useState<number | null>(0)
  const sorted = [...demoCVs].sort((a, b) => b.fit - a.fit)

  return (
    <div className="space-y-8">
      {/* Header simulado */}
      <div className="editorial-panel p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/50 mb-1">Puesto analizado</p>
          <p className="font-semibold text-cream">Ejecutivo/a de Ventas — Canal Retail</p>
          <p className="text-sm text-white/50 mt-0.5">Tigo Paraguay · Asunción</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-[#c9a84c]">{sorted.length}</p>
          <p className="text-xs text-white/50">CVs analizados</p>
        </div>
      </div>

      {/* Resumen ejecutivo IA */}
      <div className="gold-panel p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-[#c9a84c]" />
          <p className="text-xs text-[#c9a84c] uppercase tracking-widest font-medium">Decisión de la IA</p>
        </div>
        <p className="text-cream text-sm leading-relaxed">
          <strong>Top pick:</strong> Carlos Méndez (91% fit) — experiencia directa en telco con KPIs documentados.
          Recomendamos entrevistar también a María González (85%) por su historial de cierre en retail.
          Lucía Ferreira puede considerarse para posiciones de atención. Diego Ortiz y Andrés Villalba
          no cumplen el perfil mínimo requerido para este puesto.
        </p>
      </div>

      {/* Ranking */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-widest mb-3">Ranking por adecuación al puesto</p>
        <div className="space-y-2">
          {sorted.map((cv, i) => (
            <div key={cv.name} className="editorial-panel overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full p-4 flex items-center gap-4 text-left"
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-[#c9a84c]/20 text-[#c9a84c]' : 'bg-white/5 text-white/40'
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-cream">{cv.name}</p>
                    {cv.badge && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#c9a84c]/10 border border-[#c9a84c]/20 text-[#c9a84c]">
                        ✓ Verificado en {cv.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/50 truncate">{cv.title}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-white/40">ATS</p>
                    <p className="text-sm font-medium text-white">{cv.ats}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/40">Fit</p>
                    <p className={`text-sm font-bold ${cv.fit >= 80 ? 'text-[#c9a84c]' : cv.fit >= 60 ? 'text-white' : 'text-white/40'}`}>{cv.fit}%</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${recColors[cv.rec]}`}>
                    {recIcon[cv.rec]} {cv.rec}
                  </span>
                  {expanded === i ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                </div>
              </button>

              <AnimatePresence>
                {expanded === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-0 border-t border-white/5 grid sm:grid-cols-2 gap-4 mt-2">
                      <div>
                        <p className="text-xs text-emerald-400 mb-2 font-medium">Fortalezas</p>
                        <ul className="space-y-1">
                          {cv.strengths.map(s => (
                            <li key={s} className="text-sm text-white/70 flex gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs text-red-400 mb-2 font-medium">Brechas</p>
                        <ul className="space-y-1">
                          {cv.gaps.map(g => (
                            <li key={g} className="text-sm text-white/70 flex gap-2">
                              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /> {g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center pt-4">
        <p className="text-white/40 text-sm mb-4">Empezá con 10 análisis gratis. Sin tarjeta de crédito.</p>
        <Link href="/empresas">
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a84c] px-8 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] cursor-pointer">
            Acceder al panel de empresas <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Demo() {
  const [tab, setTab] = useState<'candidato' | 'empresa'>('candidato')

  return (
    <SiteShell>
      <Helmet>
        <title>Demo — CVitae Intelligence Hub</title>
        <meta name="description" content="Mirá en acción cómo CVitae ayuda a candidatos a encontrar oportunidades y a empresas a seleccionar talento con IA." />
      </Helmet>

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-24">
        <div className="relative mb-2">
          <GrowthLine className="absolute -top-4 left-0 right-0 h-16 opacity-30" />
        </div>
        <Eyebrow>Demo interactivo</Eyebrow>
        <h1 className="font-display mt-3 text-4xl text-cream sm:text-5xl">
          Mirá CVitae <em>en acción</em>.
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Sin crear cuenta. Datos de ejemplo reales del mercado paraguayo.
          Elegí si sos candidato o empresa.
        </p>

        {/* Tabs */}
        <div className="mt-10 flex gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/5 w-fit">
          <button
            onClick={() => setTab('candidato')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === 'candidato'
                ? 'bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/20'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" /> Soy candidato/a
          </button>
          <button
            onClick={() => setTab('empresa')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === 'empresa'
                ? 'bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/20'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" /> Soy empresa
          </button>
        </div>

        <div className="mt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease }}
            >
              {tab === 'candidato' ? <TabCandidato /> : <TabEmpresa />}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </SiteShell>
  )
}

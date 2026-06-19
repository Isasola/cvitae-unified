import { useState, useRef, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'wouter'
import { Upload, Sparkles, Users, Crown, ArrowRight, Trash2, FileText } from 'lucide-react'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { GrowthLine, CompatibilityTrace, Eyebrow } from '@/components/cv/visuals'
import { analytics } from '@/lib/analytics'

interface BatchCandidate {
  id: string
  file: File
  status: 'pending' | 'extracting' | 'analyzing' | 'done' | 'error'
  text?: string
  result?: any
  error?: string
}

interface BatchSummary {
  finalRecommendation: string
  hiringInsight: string
  interviewOrder: string[]
}

async function extractTextFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      try {
        const res = await fetch('/.netlify/functions/extract-pdf-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
        })
        const data = await res.json()
        resolve(data.text || '')
      } catch {
        reject(new Error('Error extrayendo texto'))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export default function BatchAnalysis() {
  const [, setLocation] = useLocation()
  const [session, setSession] = useState<any>(null)
  const [candidates, setCandidates] = useState<BatchCandidate[]>([])
  const [jobTitle, setJobTitle] = useState('')
  const [jobDesc, setJobDesc] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [summary, setSummary] = useState<BatchSummary | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const s = localStorage.getItem('recruiter_session')
    if (!s) setLocation('/empresas')
    else setSession(JSON.parse(s))
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newCandidates = files.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'pending' as const,
    }))
    setCandidates(prev => [...prev, ...newCandidates])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeCandidate = (id: string) => setCandidates(prev => prev.filter(c => c.id !== id))

  const startAnalysis = async () => {
    if (!jobTitle.trim()) { setError('Ingresá el nombre del puesto'); return }
    if (candidates.length < 2) { setError('Subí al menos 2 CVs'); return }
    setIsProcessing(true)
    setError('')
    setSummary(null)
    analytics.batchStarted(candidates.length)
    const updated = [...candidates]
    try {
      for (let i = 0; i < updated.length; i++) {
        const c = updated[i]
        setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'extracting' } : x))
        const text = await extractTextFromFile(c.file)
        setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'analyzing', text } : x))
        const res = await fetch('/.netlify/functions/analyze-cv-candidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cvText: text, mode: 'batch_analyze', jobTitle, jobDescription: jobDesc }),
        })
        const result = await res.json()
        await fetch('/.netlify/functions/validate-recruiter-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: session.token,
            action: 'save_analysis',
            analysisData: {
              candidate_name: result.candidateName || c.file.name,
              file_name: c.file.name,
              ats_score: result.fitScore,
              strengths: result.strengths,
              critical_improvements: result.criticalImprovements,
              vacancy_label: jobTitle,
              raw_cv_text: text,
            },
          }),
        })
        setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'done', result } : x))
        updated[i] = { ...updated[i], status: 'done', result }
      }
      const processedCandidates = updated.filter(c => c.status === 'done').map(c => ({
        name: c.result.candidateName || c.file.name,
        fitScore: c.result.fitScore,
        atsScore: c.result.atsScore,
        recommendation: c.result.recommendation,
        summary: c.result.summary,
        keyMatches: c.result.keyMatches,
        keyGaps: c.result.keyGaps,
      }))
      const compRes = await fetch('/.netlify/functions/compare-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'batch_summary', jobTitle, jobDescription: jobDesc, candidates: processedCandidates, topN: 3 }),
      })
      setSummary(await compRes.json())
    } catch {
      setError('Ocurrió un error durante el procesamiento masivo.')
    } finally {
      setIsProcessing(false)
    }
  }

  const doneCount = candidates.filter(c => c.status === 'done').length
  const progressPct = candidates.length > 0 ? Math.round((doneCount / candidates.length) * 100) : 0

  const rankedCandidates = candidates
    .filter(c => c.status === 'done' && c.result)
    .sort((a, b) => (b.result.fitScore || 0) - (a.result.fitScore || 0))

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Análisis Masivo de CVs | CVitae Empresas</title>
        <meta name="description" content="Analizá hasta 30 CVs en lote con IA. Ranking comparativo, score ATS y recomendación automática." />
      </Helmet>
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="relative">
          <Eyebrow>Análisis Masivo</Eyebrow>
          <h1 className="font-display text-4xl sm:text-5xl mt-2 text-cream leading-tight">
            30 CVs. Un veredicto. <em>Cero filas en Excel.</em>
          </h1>
          <p className="text-muted-foreground mt-3 max-w-xl">
            Configurá el puesto, subí el lote y CVitae te devuelve el orden de entrevista
            sugerido con justificación por candidato.
          </p>
          <div className="flex items-center justify-between mt-2">
            <p className="text-gold font-display">{session?.company_name || 'Empresa'}</p>
            <p className="text-xs text-muted-foreground">Créditos: {session?.balance || 0}</p>
          </div>
          <GrowthLine className="absolute -bottom-6 left-0 right-0 h-10 opacity-40" />
        </div>

        {/* Config stage */}
        {!isProcessing && !summary && (
          <div className="mt-12 grid lg:grid-cols-2 gap-6">
            <div className="editorial-panel p-6">
              <Eyebrow>Puesto</Eyebrow>
              <label className="block mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Nombre del puesto</label>
              <input
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="Ej: Analista de Marketing Digital"
                className="mt-2 w-full glass-panel px-3 py-2.5 text-sm text-cream placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold"
              />
              <label className="block mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Descripción / requisitos</label>
              <textarea
                rows={8}
                value={jobDesc}
                onChange={e => setJobDesc(e.target.value)}
                placeholder="Habilidades, experiencia requerida, contexto del puesto…"
                className="mt-2 w-full glass-panel px-3 py-2.5 text-sm text-cream placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold resize-none"
              />
            </div>
            <div className="editorial-panel p-6">
              <Eyebrow>Cargar CVs (hasta 30)</Eyebrow>
              <label className="mt-4 block p-10 border border-dashed border-border/60 rounded-md text-center cursor-pointer hover:border-gold/50 transition-colors">
                <Upload className="h-7 w-7 text-gold mx-auto" />
                <p className="font-display text-lg text-cream mt-3">Arrastrá hasta 30 CVs aquí</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>
              {candidates.length > 0 && (
                <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                  {candidates.map(c => (
                    <div key={c.id} className="flex items-center gap-3 text-xs glass-panel px-3 py-2">
                      <FileText className="h-3.5 w-3.5 text-gold shrink-0" />
                      <span className="flex-1 truncate text-cream">{c.file.name}</span>
                      <button onClick={() => removeCandidate(c.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {candidates.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">{candidates.length} archivo{candidates.length !== 1 ? 's' : ''} listo{candidates.length !== 1 ? 's' : ''} para analizar.</p>
              )}
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
              <button
                onClick={startAnalysis}
                disabled={candidates.length < 2 || !jobTitle.trim()}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-gold text-ink hover:bg-gold-soft h-11 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> Iniciar análisis masivo
              </button>
            </div>
          </div>
        )}

        {/* Processing stage */}
        {isProcessing && (
          <div className="mt-12 editorial-panel p-10 text-center">
            <Eyebrow>Procesando</Eyebrow>
            <h2 className="font-display text-3xl text-cream mt-2">Leyendo el pool de candidatos…</h2>
            <p className="text-muted-foreground mt-2">{doneCount} de {candidates.length} CVs analizados</p>
            <div className="mt-8 relative h-20">
              <GrowthLine variant="score" className="w-full h-full" />
            </div>
            <div className="mt-6 max-w-md mx-auto h-1.5 rounded-full bg-cream/10 overflow-hidden">
              <div className="h-full bg-gold transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* Results stage */}
        {summary && !isProcessing && (
          <div className="mt-12 space-y-6">
            {/* Veredicto IA */}
            <div className="gold-panel p-8">
              <div className="flex items-start gap-4">
                <Crown className="h-6 w-6 text-gold shrink-0 mt-1" />
                <div>
                  <Eyebrow>Veredicto de la IA</Eyebrow>
                  <h2 className="font-display text-2xl sm:text-3xl text-cream mt-1 leading-snug">
                    <em>{summary.interviewOrder?.slice(0, 3).length || 3} candidatos sólidos</em> para entrevistar esta semana.
                  </h2>
                  <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
                    {summary.finalRecommendation || summary.hiringInsight}
                  </p>
                </div>
              </div>
            </div>

            {/* Ranking */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-2xl text-cream">Orden de entrevista <em>sugerido</em></h3>
                <span className="text-xs text-muted-foreground">{rankedCandidates.length} candidatos analizados</span>
              </div>
              {rankedCandidates.map((c, i) => (
                <article key={c.id} className={i < 3 ? 'gold-panel p-5' : 'glass-panel p-5'}>
                  <div className="flex items-start gap-5 flex-wrap">
                    <div className="font-display text-3xl text-gold w-10 text-center">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-lg text-cream">{c.result.candidateName || c.file.name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.result.keyMatches?.slice(0, 3).map((m: string) => (
                          <span key={m} className="text-[11px] border border-gold/30 text-cream/90 px-2 py-0.5 rounded-full">{m}</span>
                        ))}
                      </div>
                    </div>
                    <div className="w-56">
                      <CompatibilityTrace score={c.result.fitScore || c.result.atsScore || 0} label="Fit score" />
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Círculo virtuoso */}
            <div className="glass-panel p-5 flex items-start gap-3">
              <Users className="h-5 w-5 text-gold shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Cada CV recibido por tu link de vacante también se suma al banco general de CVitae,
                ayudando a que más empresas y candidatos del ecosistema se encuentren.
              </p>
            </div>

            <button
              onClick={() => { setCandidates([]); setSummary(null); setJobTitle(''); setJobDesc('') }}
              className="inline-flex items-center gap-2 border border-border text-cream hover:bg-cream/5 h-9 px-4 rounded-md text-sm transition-colors"
            >
              Nuevo análisis
            </button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

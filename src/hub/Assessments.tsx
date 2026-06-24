import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { supabase } from '@/lib/supabase'
import {
  CheckCircle2, XCircle, Clock, Award, ChevronRight,
  AlertCircle, ArrowRight, RotateCcw,
} from 'lucide-react'

const ease = [0.22, 1, 0.36, 1] as const

// ─── Banco de preguntas ───────────────────────────────────────────────────────

const TESTS = {
  atencion: {
    label: 'Atención al Cliente',
    description: 'Evaluamos empatía, manejo de situaciones difíciles y orientación al cliente — las competencias que buscan Tigo, Atento, bancos y empresas de servicios.',
    duration: 25,
    questions: [
      {
        id: 1, type: 'situacional',
        question: 'Un cliente llama furioso porque su servicio lleva 3 días caído y ya reclamó 2 veces sin solución. ¿Cuál es tu primer paso?',
        options: [
          'Pedirle que espere en línea y transferirlo a otro área',
          'Reconocer su frustración, disculparse genuinamente y explicar qué vas a hacer ahora mismo',
          'Explicarle que el problema ya fue reportado y que debe esperar',
          'Ofrecerle un descuento inmediato para que no cancele',
        ],
        correct: 1,
      },
      {
        id: 2, type: 'situacional',
        question: 'Tenés 8 clientes esperando en línea y el sistema central se cae. ¿Cómo actuás?',
        options: [
          'Cerrás la línea hasta que el sistema vuelva',
          'Seguís atendiendo pero sin registrar nada, de memoria',
          'Informás a cada cliente del problema, das un tiempo estimado real y ofrecés devolverles el llamado',
          'Pedís a un compañero que atienda mientras vos esperás que vuelva el sistema',
        ],
        correct: 2,
      },
      {
        id: 3, type: 'situacional',
        question: 'Un cliente quiere cancelar su contrato porque encontró algo más barato en la competencia. ¿Qué hacés?',
        options: [
          'Lo dejás cancelar sin más preguntas, es su derecho',
          'Le preguntás qué encontró, mostrás el valor real del servicio y ofrecés alternativas si las hay',
          'Le decís que la competencia tiene peor calidad sin conocer la oferta',
          'Escalás inmediatamente a tu supervisor',
        ],
        correct: 1,
      },
      {
        id: 4, type: 'aptitud',
        question: 'Un cliente te explica un problema complejo con su factura. Después de escucharlo, ¿cuál es el mejor resumen para confirmar que entendiste?',
        options: [
          '"Entendido, voy a revisar su cuenta."',
          '"Lo que me estás diciendo es que [repetís el problema en tus propias palabras], ¿es correcto?"',
          '"Eso no debería pasar, voy a hacer un reclamo."',
          '"¿Puede repetirme el número de contrato?"',
        ],
        correct: 1,
      },
      {
        id: 5, type: 'situacional',
        question: 'Debés comunicarle a un cliente que su reclamo fue rechazado. ¿Cómo lo hacés?',
        options: [
          'Le enviás un email técnico con el detalle del rechazo',
          'Le decís directamente: "No procede"',
          'Explicás el motivo claro del rechazo, validás su frustración y ofrecés alternativas o pasos siguientes si existen',
          'Le pedís que presente el reclamo de nuevo con más documentación',
        ],
        correct: 2,
      },
      {
        id: 6, type: 'aptitud',
        question: 'Un cliente habla muy rápido y en guaraní mezclado con español. ¿Qué hacés?',
        options: [
          'Le pedís que hable solo en español para entenderte mejor',
          'Intentás entender, respondés en el idioma que prefiera y pedís que repita solo lo que no entendiste',
          'Transferís la llamada a alguien que hable guaraní',
          'Tomás nota de lo que entendiste y cerrás el caso así',
        ],
        correct: 1,
      },
      {
        id: 7, type: 'situacional',
        question: 'El cliente anterior fue extremadamente agresivo e insultante. Te toca atender al siguiente cliente de inmediato. ¿Cómo abrís esa llamada?',
        options: [
          'Atendés normalmente pero un poco más frío para protegerte',
          'Pedís un minuto para calmarte antes de atender',
          'Atendés con la misma energía positiva de siempre — el cliente nuevo no tiene culpa',
          'Comentás con un compañero lo que pasó antes de seguir',
        ],
        correct: 2,
      },
      {
        id: 8, type: 'personalidad',
        question: 'Cuando un cliente está en silencio después de que le explicaste algo, ¿qué interpretás?',
        options: [
          'Que no entendió y vas a tener que repetir todo',
          'Que está enojado',
          'Que está procesando — le das espacio y luego preguntás si tiene dudas',
          'Que la llamada se cortó',
        ],
        correct: 2,
      },
      {
        id: 9, type: 'aptitud',
        question: 'Tenés un tiempo promedio de atención objetivo de 4 minutos. Un cliente tiene un problema complejo que requiere 10 minutos. ¿Qué priorizás?',
        options: [
          'El tiempo — cortás en 4 minutos aunque el problema no esté resuelto',
          'La resolución del cliente — el tiempo objetivo es una guía, no una regla absoluta',
          'Escalás el caso para no afectar tu métrica',
          'Pedís al cliente que llame en otro momento',
        ],
        correct: 1,
      },
      {
        id: 10, type: 'situacional',
        question: 'Un cliente te pide algo que técnicamente podés hacer pero que viola la política de la empresa. ¿Qué hacés?',
        options: [
          'Lo hacés igual porque el cliente siempre tiene razón',
          'Negás sin explicación',
          'Explicás por qué no podés hacerlo, mostrás empatía y buscás la alternativa más cercana dentro de la política',
          'Consultás con tu supervisor y lo dejás esperando',
        ],
        correct: 2,
      },
      {
        id: 11, type: 'personalidad',
        question: 'En un día muy exigente, ¿cómo manejás el estrés?',
        options: [
          'Me cuesta mantener la calidad al final del día',
          'Busco pausas cortas para recargar y vuelvo enfocado',
          'Me esfuerzo más para compensar el cansancio',
          'Evito los casos difíciles cuando estoy cansado',
        ],
        correct: 1,
      },
      {
        id: 12, type: 'aptitud',
        question: 'Un cliente dice: "Ustedes son todos iguales, siempre prometen y nunca cumplen." ¿Cómo respondés?',
        options: [
          '"Entiendo su frustración. Lo que puedo decirle es lo que yo voy a hacer ahora mismo por usted."',
          '"No es así, nosotros sí cumplimos."',
          '"Lamento que haya tenido esa experiencia, voy a anotar su queja."',
          '"Eso no depende de mí, fue otro área."',
        ],
        correct: 0,
      },
      {
        id: 13, type: 'situacional',
        question: 'Detectás que un cliente está pagando por un servicio que no usa y que hay uno más barato para él. ¿Qué hacés?',
        options: [
          'No decís nada — no es tu trabajo reducir ingresos',
          'Se lo mencionás proactivamente aunque signifique menos facturación',
          'Esperás a que él lo note',
          'Se lo decís solo si te pregunta',
        ],
        correct: 1,
      },
      {
        id: 14, type: 'personalidad',
        question: '¿Cómo preferís recibir feedback de tu supervisor sobre un error que cometiste?',
        options: [
          'Por escrito para procesarlo tranquilo',
          'En el momento, con claridad y ejemplos concretos de cómo mejorar',
          'Que lo mencione en la evaluación mensual',
          'Prefiero descubrirlo yo solo revisando los casos',
        ],
        correct: 1,
      },
      {
        id: 15, type: 'aptitud',
        question: 'Un cliente llamó 3 veces esta semana por el mismo problema sin resolución. ¿Qué representa esto?',
        options: [
          'El cliente es muy exigente',
          'El proceso de resolución tiene una falla que hay que escalar y reportar',
          'El cliente no siguió las instrucciones correctamente',
          'Es normal en atención al cliente',
        ],
        correct: 1,
      },
    ],
  },
  ventas: {
    label: 'Ventas',
    description: 'Evaluamos orientación a resultados, manejo de objeciones y resiliencia — las competencias clave para roles comerciales en Paraguay y LATAM.',
    duration: 25,
    questions: [
      {
        id: 1, type: 'situacional',
        question: 'Llevas 3 días sin cerrar ninguna venta. ¿Cuál es tu respuesta?',
        options: [
          'Esperás que mejore la demanda',
          'Revisás tu proceso — qué cambió, dónde se cortan las conversaciones — y ajustás el enfoque',
          'Hacés más llamadas que antes para compensar',
          'Pedís a tu supervisor que te asigne mejores leads',
        ],
        correct: 1,
      },
      {
        id: 2, type: 'situacional',
        question: 'Un cliente dice "es muy caro". ¿Cuál es la mejor respuesta?',
        options: [
          '"Puedo hacerte un descuento del 10%."',
          '"¿Caro comparado con qué? Contame qué alternativas estás mirando para entender mejor."',
          '"El precio es el precio, no lo puedo cambiar."',
          '"Tenemos opciones más baratas si querés."',
        ],
        correct: 1,
      },
      {
        id: 3, type: 'situacional',
        question: 'Tenés que vender un plan de datos a alguien que dice que no usa internet. ¿Cómo arrancás?',
        options: [
          'Le mostrás las características técnicas del plan',
          'Le preguntás qué hace en su día a día y buscás un caso concreto donde internet le resolvería algo',
          'Le explicás que todo el mundo necesita internet hoy en día',
          'Le ofrecés el plan más barato para que pruebe',
        ],
        correct: 1,
      },
      {
        id: 4, type: 'aptitud',
        question: 'Un prospecto tiene contrato vigente con la competencia y dice estar satisfecho. ¿Qué hacés?',
        options: [
          'Lo descartás, no tiene sentido seguir',
          'Preguntás cuándo vence el contrato y qué necesitaría ver para considerar un cambio cuando llegue ese momento',
          'Le decís que la competencia es inferior',
          'Le mandás información por email y esperás que te contacte',
        ],
        correct: 1,
      },
      {
        id: 5, type: 'personalidad',
        question: '¿Cómo respondés emocionalmente cuando un cliente potencial te dice que no por tercera vez?',
        options: [
          'Me frustra pero sigo adelante',
          'Lo interpreto como información — "no ahora" no es "no para siempre" — y registro para un seguimiento futuro',
          'Acepto que no es el cliente correcto y sigo con otros',
          'Me cuesta recuperarme en el momento',
        ],
        correct: 1,
      },
      {
        id: 6, type: 'aptitud',
        question: '¿Cuál es la diferencia entre una objeción real y una excusa para terminar la conversación?',
        options: [
          'No hay diferencia, las dos significan que no quiere comprar',
          'Una objeción real tiene una preocupación específica que podés abordar; una excusa es vaga y no cambia con más información',
          'Las objeciones reales son sobre precio; las excusas son sobre tiempo',
          'Las excusas las hacen los clientes difíciles',
        ],
        correct: 1,
      },
      {
        id: 7, type: 'situacional',
        question: 'Estás a punto de cerrar una venta importante y el cliente pide un descuento que no tenés autorización para dar. ¿Qué hacés?',
        options: [
          'Das el descuento igual y lo justificás después',
          'Negás el descuento y explicás el valor sin él. Si es necesario, consultás con tu supervisor antes de prometer algo',
          'Le decís que es imposible y cerrás la conversación',
          'Le ofrecés algo diferente sin valor real para simular un beneficio',
        ],
        correct: 1,
      },
      {
        id: 8, type: 'personalidad',
        question: 'Tenés una meta mensual y es el día 20 con solo el 40% cumplido. ¿Cuál es tu postura?',
        options: [
          'La meta era irreal, lo voy a reportar',
          'Me enfoco en los prospectos más calientes del pipeline y ajusto la estrategia para los 10 días restantes',
          'Trabajo más horas para compensar',
          'Acepto que este mes no se va a dar y me enfoco en el próximo',
        ],
        correct: 1,
      },
      {
        id: 9, type: 'aptitud',
        question: '¿Cuál de estos es el mejor indicador de que una venta está cerca del cierre?',
        options: [
          'El cliente lleva 30 minutos en la reunión',
          'El cliente hace preguntas sobre implementación, plazos o logística post-compra',
          'El cliente pidió ver una demo',
          'El cliente dijo que le parece interesante',
        ],
        correct: 1,
      },
      {
        id: 10, type: 'situacional',
        question: 'Un cliente firmó y luego llama arrepentido queriendo cancelar. ¿Cómo manejás la situación?',
        options: [
          'Le recordás que firmó y que el contrato es vinculante',
          'Lo dejás cancelar sin preguntar',
          'Escuchás la razón, validás su preocupación y buscás si hay una solución que mantenga la venta y le dé tranquilidad',
          'Lo derivás al área de atención al cliente',
        ],
        correct: 2,
      },
      {
        id: 11, type: 'personalidad',
        question: 'Cuando no lográs una venta, ¿qué hacés después?',
        options: [
          'Sigo con el próximo prospecto sin pensar mucho en eso',
          'Analizo qué pasó, identifico un aprendizaje concreto y lo aplico en la siguiente conversación',
          'Me quedo un tiempo procesando lo que salió mal',
          'Comento con un compañero para que me diga qué hice mal',
        ],
        correct: 1,
      },
      {
        id: 12, type: 'aptitud',
        question: 'Un cliente dice: "Necesito pensarlo." ¿Cuál es la respuesta más efectiva?',
        options: [
          '"Claro, tomá el tiempo que necesités."',
          '"Entiendo. ¿Qué específicamente necesitás pensar? Así veo si puedo ayudarte a resolver esa duda ahora."',
          '"¿Cuándo me podés dar una respuesta?"',
          '"La oferta vence mañana."',
        ],
        correct: 1,
      },
      {
        id: 13, type: 'situacional',
        question: 'Tenés dos prospectos: uno listo para comprar poco y otro con gran potencial pero que necesita más trabajo. ¿A cuál priorizás?',
        options: [
          'Al de gran potencial siempre — el volumen es lo que importa',
          'Al que está listo — cerrás rápido y después trabajás el otro en paralelo',
          'Depende de cuánto tiempo queda en el mes y qué necesito para mi meta',
          'Los trabajás igual sin priorizar',
        ],
        correct: 2,
      },
      {
        id: 14, type: 'personalidad',
        question: '¿Qué te motiva más en ventas?',
        options: [
          'La comisión al final del mes',
          'El desafío de entender qué necesita cada cliente y encontrar la solución exacta',
          'Superar a mis compañeros en el ranking',
          'La variedad de personas con las que hablo',
        ],
        correct: 1,
      },
      {
        id: 15, type: 'aptitud',
        question: 'Un cliente nuevo te pregunta por qué elegiría tu producto sobre la competencia. ¿Cómo respondés?',
        options: [
          'Le listás todas las características técnicas de tu producto',
          'Primero le preguntás qué es lo más importante para él y luego mostrás cómo tu producto lo resuelve mejor',
          'Le decís que la competencia tiene problemas de calidad',
          'Le mandás un comparativo por email',
        ],
        correct: 1,
      },
    ],
  },
}

type TestKey = keyof typeof TESTS
type Phase = 'select' | 'running' | 'result'

interface BadgeResult {
  area: string
  score: number
  passed: boolean
  strengths: string[]
}

function scoreToBadge(score: number, area: string): BadgeResult {
  const passed = score >= 70
  const strengths = score >= 85
    ? ['Manejo de situaciones complejas', 'Orientación al cliente', 'Comunicación efectiva']
    : score >= 70
    ? ['Competencias básicas sólidas', 'Actitud positiva', 'Disposición para crecer']
    : ['Potencial identificado', 'Áreas de mejora claras']
  return { area, score, passed, strengths }
}

// ─── Selector de tests ────────────────────────────────────────────────────────

function TestSelector({ onSelect }: { onSelect: (key: TestKey) => void }) {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 border-amber-400/20">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-white/70">
            Los tests son <strong className="text-white">completamente opcionales</strong>.
            Tu perfil funciona igual sin ellos. Si los completás, un badge aparece en tu perfil
            visible para las empresas que busquen talento.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.entries(TESTS) as [TestKey, typeof TESTS[TestKey]][]).map(([key, test]) => (
          <motion.button
            key={key}
            onClick={() => onSelect(key)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="editorial-panel p-6 text-left hover:border-[#c9a84c]/30 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <Award className="w-6 h-6 text-[#c9a84c]" />
              <span className="text-xs text-white/40 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {test.duration} min
              </span>
            </div>
            <h3 className="font-semibold text-cream text-lg mb-2">{test.label}</h3>
            <p className="text-sm text-white/60 leading-relaxed mb-4">{test.description}</p>
            <div className="flex items-center gap-2 text-[#c9a84c] text-sm font-medium">
              Empezar test <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

// ─── Test en curso ────────────────────────────────────────────────────────────

function TestRunner({
  testKey,
  onComplete,
}: {
  testKey: TestKey
  onComplete: (result: BadgeResult) => void
}) {
  const test = TESTS[testKey]
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const q = test.questions[current]
  const total = test.questions.length
  const isLast = current === total - 1

  function handleSelect(idx: number) {
    if (confirmed) return
    setSelected(idx)
  }

  function handleNext() {
    if (selected === null) return
    const newAnswers = [...answers, selected]
    if (isLast) {
      const correct = newAnswers.filter((a, i) => a === test.questions[i].correct).length
      const score = Math.round((correct / total) * 100)
      onComplete(scoreToBadge(score, test.label))
    } else {
      setAnswers(newAnswers)
      setCurrent(current + 1)
      setSelected(null)
      setConfirmed(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-white/50">{test.label}</span>
        <span className="text-sm text-white/50">{current + 1} / {total}</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full mb-8">
        <motion.div
          animate={{ width: `${((current + 1) / total) * 100}%` }}
          className="h-full bg-gradient-to-r from-[#c9a84c] to-[#e8c97a] rounded-full"
          transition={{ duration: 0.4, ease }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease }}
        >
          <div className="mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              q.type === 'situacional' ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' :
              q.type === 'aptitud' ? 'text-purple-400 border-purple-400/20 bg-purple-400/10' :
              'text-amber-400 border-amber-400/20 bg-amber-400/10'
            }`}>
              {q.type === 'situacional' ? 'Situación real' : q.type === 'aptitud' ? 'Aptitud' : 'Autoconocimiento'}
            </span>
          </div>
          <h3 className="text-lg text-cream font-medium mb-6 leading-relaxed">{q.question}</h3>

          <div className="space-y-3">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selected === i
                    ? 'bg-[#c9a84c]/10 border-[#c9a84c]/40 text-cream'
                    : 'bg-white/[0.02] border-white/10 text-white/70 hover:border-white/25 hover:text-white'
                }`}
              >
                <span className="text-sm">{opt}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleNext}
          disabled={selected === null}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all ${
            selected !== null
              ? 'bg-[#c9a84c] text-[#0a0a0a] hover:bg-[#e6cf8a]'
              : 'bg-white/5 text-white/30 cursor-not-allowed'
          }`}
        >
          {isLast ? 'Ver mi resultado' : 'Siguiente'} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Resultado ────────────────────────────────────────────────────────────────

function TestResult({
  result,
  onSave,
  onRetry,
  saving,
}: {
  result: BadgeResult
  onSave: () => void
  onRetry: () => void
  saving: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease }}
      className="max-w-lg mx-auto text-center space-y-6"
    >
      <div className={`w-20 h-20 rounded-2xl mx-auto flex items-center justify-center ${
        result.passed ? 'bg-[#c9a84c]/15 border border-[#c9a84c]/30' : 'bg-white/5 border border-white/10'
      }`}>
        {result.passed
          ? <Award className="w-10 h-10 text-[#c9a84c]" />
          : <AlertCircle className="w-10 h-10 text-white/40" />
        }
      </div>

      <div>
        <p className="text-4xl font-bold text-cream">{result.score}<span className="text-white/40 text-2xl">/100</span></p>
        <p className="text-lg font-semibold mt-1 text-cream">{result.area}</p>
        {result.passed
          ? <p className="text-emerald-400 text-sm mt-1">¡Aprobaste! Tu badge queda en tu perfil.</p>
          : <p className="text-white/50 text-sm mt-1">No alcanzaste el mínimo de 70 esta vez.</p>
        }
      </div>

      <div className="glass-panel p-5 text-left">
        <p className="text-xs text-white/50 uppercase tracking-widest mb-3">Tus fortalezas detectadas</p>
        <ul className="space-y-2">
          {result.strengths.map(s => (
            <li key={s} className="flex gap-2 text-sm text-white/70">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3 justify-center">
        {result.passed ? (
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#c9a84c] text-[#0a0a0a] font-medium text-sm hover:bg-[#e6cf8a] transition-all disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar badge en mi perfil'}
          </button>
        ) : (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm hover:text-white transition-all"
          >
            <RotateCcw className="w-4 h-4" /> Intentar de nuevo
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Assessments() {
  const [phase, setPhase] = useState<Phase>('select')
  const [activeTest, setActiveTest] = useState<TestKey | null>(null)
  const [result, setResult] = useState<BadgeResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSaveBadge() {
    if (!result) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_master_profiles')
        .select('profile_data')
        .eq('user_id', user.id)
        .single()

      const existing = profile?.profile_data || {}
      const badges = existing.badges || []
      const newBadge = {
        area: result.area,
        score: result.score,
        passed_at: new Date().toISOString(),
      }
      const updatedBadges = [...badges.filter((b: any) => b.area !== result.area), newBadge]

      await supabase
        .from('user_master_profiles')
        .update({ profile_data: { ...existing, badges: updatedBadges } })
        .eq('user_id', user.id)

      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Verificate | CVitae</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-cream flex items-center gap-3">
            <Award className="w-6 h-6 text-[#c9a84c]" />
            Verificate
          </h1>
          <p className="text-white/50 mt-1">
            Tests opcionales que validan tus competencias. Las empresas ven tu badge cuando buscan candidatos.
          </p>
        </div>

        {saved ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="gold-panel p-8 text-center space-y-4"
          >
            <CheckCircle2 className="w-12 h-12 text-[#c9a84c] mx-auto" />
            <h2 className="text-xl font-semibold text-cream">Badge guardado en tu perfil</h2>
            <p className="text-white/60">Las empresas ya pueden ver tu verificación de <strong className="text-white">{result?.area}</strong>.</p>
            <button
              onClick={() => { setPhase('select'); setActiveTest(null); setResult(null); setSaved(false) }}
              className="text-sm text-[#c9a84c] hover:text-[#e6cf8a] transition-colors"
            >
              Hacer otro test →
            </button>
          </motion.div>
        ) : phase === 'select' ? (
          <TestSelector onSelect={(key) => { setActiveTest(key); setPhase('running') }} />
        ) : phase === 'running' && activeTest ? (
          <TestRunner
            testKey={activeTest}
            onComplete={(r) => { setResult(r); setPhase('result') }}
          />
        ) : phase === 'result' && result ? (
          <TestResult
            result={result}
            onSave={handleSaveBadge}
            onRetry={() => { setPhase('running') }}
            saving={saving}
          />
        ) : null}
      </div>
    </DashboardLayout>
  )
}

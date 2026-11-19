-- Seed 5 editorial blog articles for AdSense and SEO
-- Uses ON CONFLICT DO NOTHING so safe to re-run

INSERT INTO content_hub (titulo, slug, cuerpo, categoria, tipo, is_active, metadata, fecha_vencimiento)
VALUES

(
  'Cómo crear un CV que pase los filtros ATS en Paraguay',
  'como-crear-cv-ats-paraguay',
  $$
Si alguna vez enviaste tu CV a varias empresas y nunca recibiste respuesta, el problema podría no ser tu experiencia sino la forma en que presentás la información. La mayoría de las empresas medianas y grandes en Paraguay —y casi todas las multinacionales con operaciones en el país— utilizan sistemas de seguimiento de candidatos (ATS) para filtrar automáticamente los CVs antes de que lleguen a un reclutador humano.

## ¿Qué es un ATS y por qué importa en Paraguay?

Un ATS (Applicant Tracking System) es un software que analiza los CVs en busca de palabras clave, estructura y datos específicos. Si tu CV no cumple con ciertos criterios técnicos, el sistema lo descarta automáticamente, sin importar cuán calificado estés.

En Paraguay, empresas como Tigo, Personal, los principales bancos privados, firmas de consultoría y grupos empresariales locales utilizan algún tipo de sistema de filtrado digital en sus procesos de selección. Las convocatorias de becas internacionales, como las de BECAL o la Fundación Carolina, también aplican criterios similares en etapas de revisión.

## Errores comunes que hacen fallar tu CV en un ATS

**1. Usar tablas o columnas múltiples**

Los ATS leen el texto de forma lineal. Si tu CV tiene dos columnas —muy común en plantillas de Canva o Word— el sistema puede mezclar la información y no entender nada.

**2. Guardar el CV como imagen**

Muchos candidatos exportan su CV como JPG o PNG para que "se vea bien". El ATS no puede leer imágenes: necesita texto extraíble directamente del PDF.

**3. No incluir las palabras clave de la oferta**

Cada aviso de empleo tiene términos específicos que el ATS busca. Si el puesto dice "gestión de proyectos" y tu CV dice "administración de iniciativas", el sistema no los conecta aunque signifiquen lo mismo.

**4. Secciones con nombres creativos**

"Mi trayectoria" en lugar de "Experiencia laboral", o "Lo que sé hacer" en lugar de "Habilidades", confunden al software. Usá nombres estándar y directos.

**5. Caracteres especiales o emojis**

Los emojis y caracteres decorativos pueden corromper la lectura del texto por parte del ATS.

## Estructura recomendada para un CV ATS-friendly

Para el mercado paraguayo, la estructura más efectiva es:

1. **Nombre y datos de contacto** — Nombre completo, teléfono, correo y ciudad (Asunción, Central, etc.)
2. **Perfil profesional** — 2-3 líneas que resuman tu propuesta de valor
3. **Experiencia laboral** — en orden cronológico inverso, lo más reciente primero
4. **Educación** — institución, carrera y año de graduación
5. **Habilidades** — técnicas y blandas, expresadas como términos concretos
6. **Idiomas** — nivel CEFR si es posible (B2, C1, etc.)

## Cómo incluir palabras clave sin parecer spam

La técnica más efectiva es leer el aviso de empleo y anotar los términos que se repiten: el nombre del cargo, las herramientas mencionadas (Excel, SAP, Python), los sectores y los idiomas requeridos. Luego, incorporá esos términos de forma natural en tu perfil profesional y en las descripciones de tu experiencia.

Por ejemplo, si el aviso busca "analista de datos con experiencia en Power BI y SQL", asegurate de que esas palabras aparezcan explícitamente en tu CV, no solo en forma implícita.

## El formato ideal para enviar tu CV en Paraguay

PDF es el estándar, pero asegurate de que el PDF tenga texto seleccionable y no sea una imagen escaneada. Si usás Word, guardá en formato .docx estándar. Evitá los CVs con fotos a menos que el aviso lo solicite explícitamente.

## Verificá tu CV antes de enviar

Antes de postularte, podés subir tu CV en CVitae para obtener un diagnóstico ATS gratuito. El sistema analiza la estructura, la claridad y las secciones más importantes, y te dice exactamente qué mejorar antes de que lo vea un reclutador.

El mercado laboral paraguayo es cada vez más competitivo. Tener un CV bien estructurado no garantiza el empleo, pero sí garantiza que tu candidatura llegue a las manos correctas.
$$,
  'Consejos de carrera',
  'blog',
  true,
  '{"author_name": "Equipo editorial de CVitae"}',
  null
),

(
  'Las 10 habilidades más valoradas por empresas paraguayas en 2026',
  'habilidades-demandadas-mercado-laboral-paraguay-2026',
  $$
El mercado laboral paraguayo está cambiando rápido. Con la expansión del sector tecnológico en Asunción, el crecimiento del comercio electrónico y la digitalización del sector financiero, las habilidades que buscan las empresas hoy son muy diferentes a las de hace apenas cinco años. Este artículo resume qué competencias priorizan los reclutadores en Paraguay durante 2026.

## 1. Análisis de datos y manejo de Excel avanzado

Casi todos los sectores —desde agro hasta finanzas— demandan profesionales capaces de trabajar con datos. Saber usar Excel a nivel avanzado (tablas dinámicas, Power Query, fórmulas complejas) ya no es diferencial: es requisito mínimo. Quienes dominen Power BI o SQL tienen una ventaja clara.

## 2. Habilidades en herramientas de gestión de proyectos

Metodologías como Scrum o herramientas como Trello, Asana y ClickUp son cada vez más comunes en empresas medianas. La gestión de proyectos no es solo para ingenieros: se pide en marketing, recursos humanos y operaciones.

## 3. Inglés profesional (nivel B2 o superior)

Con la llegada de más empresas multinacionales a Paraguay y el crecimiento del trabajo remoto para clientes del exterior, el inglés dejó de ser un "plus" para ser un requisito en muchos puestos. El nivel B2 del CEFR es el mínimo solicitado para roles corporativos.

## 4. Comunicación clara y redacción profesional

En un entorno donde el trabajo híbrido y remoto crece, la capacidad de escribir bien —correos, informes, propuestas— es altamente valorada. No se trata de ser escritor sino de comunicar ideas con claridad y sin ambigüedades.

## 5. Conocimientos en marketing digital

Las empresas paraguayas están invirtiendo más en presencia digital. Conocimientos de SEO, redes sociales, Google Ads o email marketing son buscados no solo en agencias sino en empresas de cualquier rubro.

## 6. Inteligencia emocional y trabajo en equipo

Las habilidades blandas siguen siendo una prioridad para los reclutadores. La inteligencia emocional —capacidad de gestionar el estrés, trabajar con diferentes personalidades y resolver conflictos— aparece en muchos procesos de selección, especialmente para posiciones de liderazgo.

## 7. Conocimientos básicos de programación o automatización

No es necesario ser programador, pero entender qué es una API, poder escribir macros en Excel o automatizar tareas con herramientas como Zapier o Power Automate abre puertas en muchos rubros.

## 8. Manejo de CRM y herramientas de ventas

Para roles comerciales —que representan una gran parte del mercado paraguayo— el manejo de CRMs como Salesforce o HubSpot es cada vez más solicitado, especialmente en empresas del sector financiero y tecnológico.

## 9. Pensamiento crítico y resolución de problemas

Los reclutadores en Paraguay valoran mucho a los candidatos que muestran cómo enfrentaron y resolvieron problemas concretos en trabajos anteriores. En las entrevistas, esto se evalúa con preguntas situacionales.

## 10. Adaptabilidad y aprendizaje continuo

El ritmo de cambio tecnológico hace que las empresas busquen personas que puedan aprender rápido y adaptarse a nuevas herramientas o procesos. Tener certificaciones recientes (Google, Microsoft, HubSpot, Coursera) demuestra esta disposición al aprendizaje.

## Cómo mostrar estas habilidades en tu CV

No basta con listar las habilidades: hay que demostrarlas con evidencia. En lugar de escribir "buen manejo de Excel", escribí "diseñé tableros de seguimiento de ventas en Excel para un equipo de 12 personas, reduciendo el tiempo de reporte semanal en un 40%". Los números y contextos concretos hacen que tu CV se destaque.

CVitae analiza tu perfil y te ayuda a identificar cuáles de estas habilidades ya tenés documentadas y cuáles vale la pena agregar para mejorar tus chances en el mercado paraguayo.
$$,
  'Mercado laboral',
  'blog',
  true,
  '{"author_name": "Equipo editorial de CVitae"}',
  null
),

(
  'Guía para postularse a becas internacionales desde Paraguay',
  'guia-becas-internacionales-desde-paraguay',
  $$
Paraguay tiene un ecosistema activo de becas internacionales que muchos profesionales y estudiantes desconocen. Desde las becas BECAL del gobierno paraguayo hasta oportunidades de la OEA, la Unión Europea, Japón y universidades de Estados Unidos, las opciones son más amplias de lo que parece. Esta guía te explica cómo navegar el proceso.

## Las principales fuentes de becas para paraguayos

**BECAL (Becas Carlos Antonio López):** Es el programa más grande del país. Financia posgrados (maestrías y doctorados) en universidades del exterior, con foco en ciencias, tecnología, ingeniería, matemáticas y áreas estratégicas para el desarrollo. Las convocatorias se abren una o dos veces al año.

**Fundación Carolina:** Financia estudios de posgrado en España para profesionales latinoamericanos. Tiene requisitos estrictos de experiencia y rendimiento académico.

**OEA (Organización de Estados Americanos):** Ofrece becas para posgrados, pasantías e investigación. Ideal para perfiles de ciencias sociales, derecho y políticas públicas.

**Programa de Becas de Japón (MEXT):** Financia estudios de grado y posgrado en universidades japonesas. Requiere buen nivel académico y, en algunos casos, conocimientos básicos de japonés.

**Fulbright:** Las becas Fulbright para paraguayos permiten realizar estudios o investigación en Estados Unidos. La Comisión Fulbright Paraguay gestiona el proceso localmente.

**Unión Europea (Erasmus+):** Para profesionales con vínculo con instituciones académicas, permite estadías de investigación o docencia en universidades europeas.

## Los requisitos más comunes

La mayoría de las becas comparten estos requisitos base:

- Título universitario de grado completado
- Promedio académico bueno (generalmente 7/10 o equivalente)
- Carta de motivación en español o inglés
- Dos cartas de recomendación de docentes o empleadores
- Propuesta de investigación o plan de estudios
- Nivel de idioma certificado (TOEFL, IELTS o equivalente para inglés; DELE para español en algunos casos)
- Cédula de identidad paraguaya vigente

## Los errores más frecuentes en las postulaciones

**1. Carta de motivación genérica**

Los evaluadores leen cientos de cartas. Las que funcionan son específicas: explican por qué esa universidad, por qué ese programa, qué problema concreto querés resolver con esa formación y cómo contribuirá al desarrollo de Paraguay.

**2. Propuesta de investigación débil o inexistente**

Para programas de posgrado, una propuesta de investigación sólida puede ser decisiva. Tiene que mostrar que entendés el estado del arte del tema y que tu contribución es original y viable.

**3. Cartas de recomendación vagas**

Una carta que dice "es un buen profesional y estudiante dedicado" no aporta. Las cartas deben citar ejemplos concretos de trabajo, habilidades específicas y potencial del candidato.

**4. No verificar los requisitos de idioma con tiempo**

El TOEFL y el IELTS requieren preparación. No te postules a una beca que requiere nivel B2 si no tenés un certificado que lo respalde.

## Cómo organizar tu postulación

Lo más recomendable es crear una carpeta digital con:

- CV actualizado en formato ATS
- Transcripción académica oficial apostillada
- Certificados de idioma
- Cartas de recomendación (pedirlas con al menos 6 semanas de anticipación)
- Carta de motivación con versiones adaptadas a cada convocatoria

Postularse a becas es un proceso que lleva tiempo. Los mejores candidatos destinan varias semanas a preparar cada postulación y no esperan a último momento.

CVitae agrega las convocatorias de BECAL y otras becas abiertas a paraguayos en tiempo real. Podés activar alertas para recibir las convocatorias relevantes según tu perfil.
$$,
  'Becas y posgrados',
  'blog',
  true,
  '{"author_name": "Equipo editorial de CVitae"}',
  null
),

(
  'Cómo prepararte para una entrevista laboral en Paraguay',
  'como-prepararte-entrevista-laboral-paraguay',
  $$
Una entrevista de trabajo bien preparada puede marcar la diferencia entre quedarte en el proceso o ser descartado en la primera ronda. En Paraguay, el proceso de entrevistas combina prácticas locales con estándares regionales e internacionales, especialmente en empresas con presencia en varios países. Esta guía te ayuda a prepararte de forma efectiva.

## Antes de la entrevista: el trabajo de fondo

**Investigá la empresa a fondo**

Antes de entrar a cualquier entrevista, conocé la empresa: cuántos empleados tiene, qué productos o servicios ofrece, quiénes son sus competidores, si tiene presencia regional o internacional. Revisá su LinkedIn, su web oficial y cualquier noticia reciente. En Paraguay, un candidato que menciona un logro reciente de la empresa siempre impresiona.

**Estudiá la descripción del puesto**

Leé el aviso de empleo palabra por palabra. Identificá las responsabilidades principales y las habilidades requeridas. Preparate para explicar cómo tu experiencia se relaciona con cada punto.

**Preparate para las preguntas más comunes**

Estas preguntas aparecen en casi todas las entrevistas paraguayas:

- "Contame de vos" / "Presentate brevemente"
- "¿Por qué querés trabajar en esta empresa?"
- "¿Cuáles son tus fortalezas y debilidades?"
- "¿Dónde te ves en cinco años?"
- "Contame de un conflicto laboral que hayas tenido y cómo lo resolviste"

Para la última categoría —preguntas situacionales— usá el método STAR: describí la Situación, la Tarea, la Acción que tomaste y el Resultado.

## Durante la entrevista: qué tener en cuenta

**La puntualidad es crítica**

En Paraguay, llegar tarde a una entrevista es una señal de falta de compromiso. Llegá entre 5 y 10 minutos antes. Si es virtual, probá tu conexión y cámara con anticipación.

**Lenguaje corporal**

Mantené contacto visual sin ser invasivo, postura erguida pero relajada, y evitá gestos de inseguridad como cruzar los brazos o mirar hacia abajo. Una sonrisa genuina al inicio establece un buen tono.

**Cómo hablar de tu remuneración esperada**

Es común que en Paraguay pregunten el salario pretendido. Investigá el rango del mercado para el puesto (portales como Computrabajo o grupos de LinkedIn son buenas referencias). Podés dar un rango y agregar "según los beneficios y responsabilidades". Evitá dar un número muy bajo por miedo al rechazo.

**Las preguntas que vos hacés también cuentan**

Al final de la entrevista, casi siempre preguntan si tenés dudas. Tener preguntas preparadas demuestra interés genuino. Algunas buenas opciones: "¿Cómo es el proceso de inducción?" o "¿Cuáles son los principales desafíos del equipo en este momento?"

## Después de la entrevista

Enviá un correo de agradecimiento dentro de las 24 horas. No tiene que ser largo: un párrafo reafirmando tu interés y agradeciendo el tiempo es suficiente. Esta práctica es menos común en Paraguay que en otros mercados, pero precisamente por eso te diferencia.

Si no recibís respuesta en el plazo que mencionaron, podés hacer un seguimiento educado por correo o LinkedIn, una sola vez.

## Entrevistas virtuales: el nuevo estándar

Con el crecimiento del trabajo remoto y la internacionalización de algunas empresas con sede en Paraguay, las entrevistas por Zoom, Teams o Google Meet son cada vez más frecuentes. Cuidá el fondo de tu cámara, la iluminación (la luz debe venir de frente, no de atrás) y el audio. Vestite como si fuera presencial.

CVitae puede ayudarte a identificar brechas en tu perfil antes de una entrevista. Con el diagnóstico ATS sabés exactamente qué preguntas podría hacerte el reclutador sobre puntos débiles de tu CV.
$$,
  'Consejos de carrera',
  'blog',
  true,
  '{"author_name": "Equipo editorial de CVitae"}',
  null
),

(
  'Los sectores con más oportunidades laborales en Paraguay para 2026',
  'sectores-oportunidades-laborales-paraguay-2026',
  $$
El mercado laboral paraguayo atraviesa un momento de transformación. Algunos sectores tradicionales muestran saturación, mientras que otros —impulsados por la inversión extranjera, la digitalización y el crecimiento económico sostenido— presentan una demanda de talento que supera la oferta local. Conocer estos sectores te permite enfocar tu desarrollo profesional y tu búsqueda de empleo de forma más estratégica.

## Tecnología e informática: el sector de mayor crecimiento

Paraguay se está posicionando como un hub tecnológico regional, con empresas de software, startups y call centers tecnológicos que generan miles de empleos. Asunción concentra la mayoría de estas oportunidades, pero el trabajo remoto ha abierto el mercado nacional.

Los perfiles más demandados son desarrolladores web y mobile (especialmente con experiencia en React, Node.js, Python y Java), analistas de datos, especialistas en ciberseguridad y administradores de base de datos. La demanda supera ampliamente a la oferta, lo que genera salarios por encima del promedio.

## Sector financiero y fintech

Los bancos, cooperativas, financieras y el emergente ecosistema fintech paraguayo contratan de forma constante. La digitalización acelerada del sistema financiero creó una demanda sostenida de perfiles que combinen conocimientos financieros con habilidades tecnológicas.

Los rubros más activos incluyen análisis de riesgo, cumplimiento normativo (compliance), transformación digital bancaria y atención al cliente especializada. Las cooperativas, que tienen una presencia enorme en Paraguay con millones de socios, también son una fuente importante de empleo estable.

## Agronegocios y logística

Paraguay es uno de los principales exportadores mundiales de soja, carne bovina y maíz. El sector agroexportador demanda profesionales en gestión agropecuaria, logística internacional, comercio exterior y sostenibilidad. La trazabilidad de productos y la certificación para mercados europeos están generando nuevos roles relacionados con calidad y medioambiente.

## Salud y farmacéutico

El sector salud en Paraguay creció aceleradamente en los últimos años, impulsado por inversión privada en clínicas y sanatorios, y por la expansión de laboratorios farmacéuticos. Los perfiles más solicitados incluyen enfermeros, técnicos en diagnóstico, administradores de salud y profesionales en gestión hospitalaria.

## Educación y formación profesional

Con la expansión de universidades privadas y la demanda de capacitación corporativa, el sector educativo ofrece oportunidades para docentes con formación en áreas técnicas, diseñadores instruccionales y coordinadores académicos. El auge del e-learning también creó roles en producción de contenido educativo digital.

## Retail y e-commerce

El comercio electrónico en Paraguay creció de forma sostenida. Empresas de retail, supermercados y marcas locales buscan profesionales en marketing digital, logística de última milla, análisis de ventas y experiencia del cliente. El auge de marketplaces como Mercado Libre también generó roles en gestión de tiendas virtuales.

## Construcción e ingeniería

Los proyectos de infraestructura pública —carreteras, viviendas sociales, plantas de energía— y el boom inmobiliario en Asunción y las ciudades del Este mantienen una demanda constante de ingenieros civiles, arquitectos, técnicos en construcción y gestores de obras.

## Cómo aprovechar estas tendencias en tu búsqueda

Conocer en qué sectores hay más demanda te permite:

1. Enfocar tus postulaciones en los mercados con mayor absorción de talento
2. Identificar qué habilidades complementarias podés desarrollar para aumentar tu empleabilidad
3. Fijar expectativas salariales más realistas según el rubro

CVitae agrega en tiempo real miles de ofertas laborales de estos sectores en Paraguay, incluyendo oportunidades de empresas que no publican en portales tradicionales. Activá las alertas para recibir las vacantes que coincidan con tu perfil directamente en tu correo.
$$,
  'Mercado laboral',
  'blog',
  true,
  '{"author_name": "Equipo editorial de CVitae"}',
  null
)

ON CONFLICT (slug) DO NOTHING;

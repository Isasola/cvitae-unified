"""
Inserta el blog post de lanzamiento de beta pública de CVitae
en content_hub de Supabase producción. Correr una sola vez.

ANTES DE EJECUTAR:
  export SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key-de-produccion"
  python scrapers/insert_launch_blog.py

La SUPABASE_URL ya apunta a producción (hardcodeada).
La key LOCAL del .env NO funciona aquí — necesitás la de producción
desde Supabase Dashboard → Project Settings → API → service_role.
"""
import requests
import os
import sys

SUPABASE_URL = "https://rbrirxbjbmdxflzaxxzp.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY no está definida.")
    print("Corré: export SUPABASE_SERVICE_ROLE_KEY='tu-key-de-produccion'")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

BODY = """## CVitae ya está disponible: analizá tu CV con IA y encontrá empleo en Paraguay

Si alguna vez mandaste un CV y nunca recibiste respuesta — incluso para trabajos donde claramente cumplías los requisitos —, existe una razón técnica que pocas personas conocen: el **score ATS**.

Hoy CVitae abre su beta pública para que cualquier persona en Paraguay pueda analizarlo gratis.

---

## ¿Qué es CVitae?

CVitae es una **plataforma de inteligencia de carrera construida específicamente para el mercado paraguayo**. Combina inteligencia artificial con una base de datos actualizada diariamente de empleos, becas, organismos internacionales y concursos para que puedas tomar decisiones informadas sobre tu carrera.

No es solo un listado de ofertas. Es un sistema que entiende tu perfil y te conecta con las oportunidades que realmente te corresponden.

---

## ¿Qué podés hacer en CVitae?

### Analizar tu CV gratis con score ATS

El primer paso es entender cómo te ven los sistemas de reclutamiento. CVitae analiza tu CV y te devuelve un **score ATS del 0 al 100**, indicando qué tan bien está optimizado para pasar los filtros automáticos que usan las empresas.

¿Qué es un score ATS? Los ATS (Applicant Tracking Systems) son los softwares que las empresas usan para filtrar postulaciones antes de que lleguen a un reclutador humano. Según estudios de mercado global, hasta el 75% de los CVs son descartados automáticamente — no por falta de experiencia, sino porque no usan las palabras clave correctas.

Un score alto significa que tu CV tiene más probabilidades de llegar a la etapa de entrevista.

### Matching diario con oportunidades reales

Cada día, CVitae actualiza su base de datos con oportunidades de empleos en Paraguay, empleos remotos para latinoamericanos, becas de posgrado, convocatorias de organismos internacionales (ONU, BID, UNICEF) y concursos de emprendimiento.

El sistema cruza tu perfil con estas oportunidades y te muestra las que mejor se ajustan a tu experiencia, habilidades e intereses. No tenés que buscar — las oportunidades llegan a vos.

### CV Vivo: tu CV adaptado por IA para cada postulación

Esta es la función central de la plataforma. El **CV Vivo** toma tu perfil y lo adapta automáticamente a cada vacante o convocatoria, usando las palabras clave específicas de esa oportunidad.

El resultado es un CV personalizado, escrito en primera persona, con tus logros reales — la IA reorganiza y enfatiza lo que ya tenés, no inventa nada. Podés descargarlo listo para postular en minutos.

### Alertas personalizadas de empleo

Configurá alertas con tus palabras clave (puesto, área, sector) y recibí notificaciones cuando aparezcan nuevas oportunidades que coincidan con tu perfil. Sin ruido, sin spam — solo lo relevante para vos.

---

## ¿Por qué es gratis?

CVitae está en **beta pública**. Eso significa que el producto está funcionando y recibiendo usuarios reales, y queremos mejorar con retroalimentación genuina antes de definir el modelo de precios final.

Durante este período, todas las funciones B2C son gratuitas:

- Análisis ATS de tu CV
- Matching con oportunidades
- CV Vivo adaptado por IA
- Alertas personalizadas

Si te registrás ahora, bloqueás tu acceso gratuito durante todo el período de beta. Sin tarjeta de crédito, sin compromisos.

---

## Para empresas: las primeras 100 se suman gratis

CVitae también tiene una solución para empresas que buscan talento. El plan B2B (normalmente **USD 79/mes**) incluye búsqueda en la base de candidatos, análisis masivo de CVs y acceso al sistema de matching inverso.

Las **primeras 100 empresas** que se registren en la plataforma acceden de forma gratuita durante la beta. Si tu empresa está buscando incorporar talento en Paraguay, esta es la oportunidad de probar el sistema sin costo.

---

## Construido para Paraguay

CVitae no es una herramienta genérica adaptada al mercado local. Fue diseñado desde el principio para las particularidades del mercado laboral paraguayo: las fuentes de empleo locales, el tipo de oportunidades disponibles, los sectores con más demanda y la realidad de los profesionales que buscan crecer en el país o proyectarse al exterior.

Eso incluye oportunidades que no encontrás en plataformas internacionales: becas BECAL, convocatorias de organismos con sede en Asunción, empleos en empresas paraguayas y regionales, y concursos de emprendimiento locales.

---

## Empezá hoy: analizá tu CV gratis

La **búsqueda de empleo en Paraguay** está cambiando. Las plataformas de carrera inteligente ya no son solo para mercados grandes. CVitae lleva esa tecnología a quienes la necesitan acá.

Registrate en [cvitae.lat](https://cvitae.lat), subí tu CV y en minutos vas a tener tu score ATS y las primeras oportunidades que coinciden con tu perfil.

Gratis. Sin complicaciones. Construido para vos.

---

*CVitae es una plataforma de inteligencia de carrera para Paraguay y LatAm. Conecta candidatos con oportunidades usando IA y ayuda a empresas a encontrar talento de forma más eficiente. Aún no garantizamos resultados de empleo — sí garantizamos que vas a tener más y mejores herramientas para postular.*
"""

post = {
    "tipo": "blog",
    "slug": "cvitae-beta-publica-analiza-cv-gratis-paraguay",
    "titulo": "CVitae entra en beta pública: analizá tu CV gratis y encontrá el trabajo que te corresponde en Paraguay",
    "cuerpo": BODY.strip(),
    "categoria": "noticias",
    "is_active": True,
    "imagen_url": None,
    "fecha_vencimiento": None,
    "ubicacion": None,
    "metadata": {
        "description": "CVitae abre su beta pública: analizá tu CV gratis, obtené tu score ATS y encontrá empleos, becas y oportunidades en Paraguay con inteligencia artificial.",
        "keywords": "analizar CV gratis Paraguay, score ATS, búsqueda de empleo Paraguay, plataforma de carrera inteligente, CV vivo IA, beta CVitae, empleos Paraguay",
        "og_description": "CVitae ya está en beta pública. Analizá tu CV con IA, obtené tu score ATS gratis y conectate con oportunidades reales en Paraguay.",
    },
}

r = requests.post(
    f"{SUPABASE_URL}/rest/v1/content_hub",
    headers=HEADERS,
    json=post,
)

print(f"Status: {r.status_code}")
if r.status_code not in (200, 201):
    print(f"Error: {r.text}")
else:
    print("Blog post insertado correctamente.")
    print(f"Slug: {post['slug']}")
    print(f"URL pública: https://cvitae.lat/blog/{post['slug']}")

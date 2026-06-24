"""
Inserta el artículo del blog "Cómo hacer tu CV gratis para cada oportunidad"
en content_hub de Supabase. Correr una sola vez.
"""
import requests
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

BODY = """## Por qué tu CV genérico te está costando oportunidades

El sistema ATS (Applicant Tracking System) que usan la mayoría de las empresas y organismos internacionales **filtra el 75% de los CVs antes de que un humano los vea**. El problema no es tu experiencia — es que tu CV no usa las palabras exactas de la convocatoria.

Cada vacante busca algo específico. Un programa de becas en España no quiere el mismo perfil que una empresa de logística en Asunción. Si mandás el mismo CV a los dos, los dos te van a rechazar.

## La solución: CV adaptado con IA, en minutos y gratis

CVitae tiene una función llamada **CV Vivo** que hace exactamente esto:

1. **Subís tu CV o completás tu perfil** — una sola vez
2. **Elegís la vacante o convocatoria** — podés pegar el texto directamente si la oportunidad no está en el listado
3. **La IA genera tu CV adaptado** — reescribe tu resumen, reordena tus habilidades y usa las palabras clave exactas de la oferta
4. **Descargás o copiás el resultado** — listo para postular

El CV generado es 100% tuyo, en primera persona, con tus logros reales. La IA no inventa — reorganiza y enfatiza lo que ya tenés.

## Está disponible gratis durante la beta

Mientras CVitae está en versión beta (para validar el producto con usuarios reales), **todas las funciones B2C son gratuitas**:

- ✦ Score de empleabilidad ATS
- ✦ Matching con más de 1.500 oportunidades actualizadas diariamente
- ✦ CV Vivo adaptado por IA para cada postulación
- ✦ Alertas de empleo por palabras clave

Después de la beta, el CV Vivo y las alertas avanzadas pasarán a ser funciones premium. Si te registrás ahora, **bloqueás tu acceso gratuito durante todo el período de desarrollo**.

## Paso a paso: cómo usar CV Vivo hoy

### Opción A — Para oportunidades del listado (becas, empleos locales, empleos remotos)

1. Entrá a [cvitae.lat](https://cvitae.lat) y creá tu cuenta (solo necesitás tu email)
2. En el dashboard, completá tu perfil o subí tu CV en PDF
3. Ir a **Mi Carrera → CV Vivo**
4. Elegí cualquier oportunidad del listado
5. En segundos tenés tu CV adaptado — descargalo en Markdown listo para copiar a Word, Google Docs o el portal de postulación

### Opción B — Para cualquier vacante que encontrás en internet (becas externas, LinkedIn, portales de empresas)

1. Copiá la descripción completa de la convocatoria
2. En CV Vivo, elegí **"Vacante personalizada"** y pegá el texto
3. La IA adapta tu CV a esa oportunidad específica
4. Tu postulación queda guardada — si otras personas también postulan a esa empresa, empieza a construirse el banco de talento

## Qué tipos de oportunidades podés encontrar en CVitae

El listado se actualiza todos los días con oportunidades de las empresas, organismos e instituciones con más presencia en Paraguay y la región:

- **Empleos en Paraguay** — Computrabajo, BuscoJobs, empresas directas
- **Empleos remotos para latinos** — Remotive (software, diseño, marketing, datos)
- **Becas de posgrado** — BECAL, Fundación Carolina, OpportunityDesk, OYA
- **Organismos internacionales** — UNDP, UNICEF, BID, OEA vía UNJobs
- **Capital semilla y concursos** — premios, grants, aceleradoras para emprendedores

## El truco que pocos usan: pegar la convocatoria completa

Cuando usás Opción B y pegás toda la descripción (no solo el título), la IA tiene mucho más contexto para adaptar tu CV. Incluí:

- Responsabilidades del puesto
- Requisitos obligatorios y deseables
- Valores o misión de la organización
- Palabras clave técnicas del área

Cuanto más detalle, mejor el resultado.

---

*CVitae es una plataforma de inteligencia de carrera para Paraguay y LatAm. Conecta candidatos con oportunidades usando IA, y ayuda a empresas a encontrar talento de forma más eficiente.*

*Si llegaste hasta acá y todavía no probaste CV Vivo, [creá tu cuenta gratuita acá](https://cvitae.lat). Tarda 2 minutos.*
"""

post = {
    "tipo": "blog",
    "slug": "como-hacer-cv-gratis-para-cada-oportunidad",
    "titulo": "Cómo hacer tu CV gratis para cada oportunidad (y que te lean de verdad)",
    "cuerpo": BODY.strip(),
    "categoria": "Consejos de Carrera",
    "is_active": True,
    "imagen_url": None,
    "metadata": {
        "description": "Aprende a adaptar tu CV para cada vacante con IA, completamente gratis durante la beta de CVitae. Funciona para empleos, becas y organismos internacionales.",
        "keywords": "cv adaptado, cv vivo, ats, becas paraguay, empleos remotos latinos, ia carrera",
        "og_description": "Tu CV genérico te está costando oportunidades. Aprende a adaptarlo para cada postulación con IA, gratis."
    }
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

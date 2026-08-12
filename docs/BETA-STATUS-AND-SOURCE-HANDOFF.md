# CVitae beta: estado real y handoff

Fecha de corte: 12 de agosto de 2026.

## Cierre B2B de esta tanda

- Recruiters y analisis masivo incorporan guias de primer uso, popups de creditos y criterio humano, y una lectura transparente del score.
- La postulacion comunica de forma condicional si se creo perfil y envio acceso por email; sin consentimiento solo confirma el envio a la empresa.
- Se agrego navegacion por teclado para expandir candidatos y se aclaro que el score no elimina ni notifica personas.
- El endpoint batch hace un preflight de saldo y el descuento final ocurre al guardar cada resultado; queda pendiente convertirlo en una reserva transaccional antes de llamar a Bedrock.
- No se pudo completar una captura visual navegable porque el servidor local Vite no logro iniciar en esta sesion; la revision visual no queda certificada por captura.

## Auditoría funcional B2C/B2B — 12 de agosto

Se dejó fuera deliberadamente la aprobación y carga de nuevos scrapers. La auditoría se concentró en el flujo existente con las oportunidades ya investigadas.

Correcciones aplicadas:

- B2C matching filtra elegibilidad declarada para Paraguay/Latinoamérica y excluye licitaciones también cuando llegan con campos heredados o texto de licitación.
- B2C conserva el filtro de vigencia, verificación, permisos de matching, archivado y borrado lógico.
- B2B sólo analiza postulantes pendientes por defecto; el reanálisis debe ser explícito.
- El análisis de postulantes reserva créditos de forma atómica y devuelve los créditos correspondientes cuando falla IA o persistencia.
- El análisis masivo valida objetos malformados y rechaza lotes que superan el saldo antes de iniciar IA.
- El panel B2B envía la intención de reanálisis sólo cuando ya existen resultados previos.

Validaciones ejecutadas después de estos cambios:

- `npm.cmd run build`: aprobado.
- `npm.cmd run test:critical`: aprobado.
- `python -m unittest tests.test_priority_scrapers -v`: 2/2 aprobado.
- `python scripts\\validate_scraper_registry.py`: 40 fuentes válidas.
- `python scripts\\audit_scraper_contracts.py`: sin errores de sintaxis; los POST directos heredados continúan bajo el adaptador universal.
- `git diff --check`: limpio.
- Importación de las dos funciones Netlify modificadas: aprobada.

Limitaciones todavía abiertas:

- No hay ejecución contra Supabase productivo ni prueba E2E con datos reales en esta sesión.
- No se pudo ejecutar `deno check` porque Deno no está instalado localmente.
- La función Edge de matching debe probarse después de aplicar migraciones en un entorno controlado.
- La auditoría visual, responsive y comercial del panel B2B queda para el siguiente bloque.

## Avance local de catálogo y matching

Esta tanda cerró un bloqueo funcional entre recolección, moderación y publicación:

- `/oportunidades` y `/oportunidades/:slug` dejaron de leer `content_hub` y ahora leen la tabla canónica `opportunities`.
- El catálogo sólo muestra registros activos, verificados, habilitados para catálogo y no eliminados.
- El catálogo separa becas, financiación, programas y experiencias; empleo y pasantías continúan en `/empleos`.
- El detalle muestra organización, ubicación, fecha límite, financiación, elegibilidad y postulación cuando existen.
- El admin aclara que el permiso de catálogo publica en `/empleos` o `/oportunidades` según el tipo.
- El botón de aprobación ahora dice `Verificar y aplicar permisos`; respeta los toggles de catálogo, matching, alertas y SEO.
- `match-batch` usa el `slug` real, excluye fechas vencidas y no recomienda licitaciones en el flujo individual B2C.
- No se desplegó, no se insertaron candidatos y no se activó ninguna fuente.

Validación local de esta tanda:

- `npm run build`: aprobado.
- `python -m unittest tests.test_priority_scrapers`: 2 pruebas aprobadas.
- `npm.cmd run test:critical`: flujos críticos aprobados.
- El test de PDF conserva advertencias locales por el binario opcional de `canvas` y fuentes de PDF.js; no impidieron completar las verificaciones.

Siguiente bloque recomendado: probar con datos controlados el recorrido moderación → aprobación → catálogo → detalle → matching, y después realizar el smoke test B2B. No sumar una tanda grande de fuentes antes de certificar ese circuito.

## Estado de seguridad de dependencias

- Se actualizaron Axios, nanoid, Mermaid, DOMPurify y transitivas vulnerables mediante el lockfile de pnpm.
- `pdfjs-dist` se migró de 3.11.174 a 4.2.67, primera versión publicada en npm posterior al rango vulnerable del advisory.
- PDF.js se carga como ESM externo para que Netlify no lo convierta a CommonJS; el empaquetado offline de las 20 funciones fue aprobado.
- `pnpm audit --prod` pasó de 27 hallazgos (incluido uno crítico) a cero vulnerabilidades conocidas.
- La extracción real de un PDF generado y el rechazo de un PDF inválido están cubiertos por `test:critical`.

## Endurecimiento B2B y CV

- El análisis masivo exige una empresa activa y verificada; el acceso anónimo quedó bloqueado por prueba.
- Los lotes de IA procesan como máximo tres candidatos simultáneos para reducir rate limits y fallos parciales.
- La identidad de la empresa de una vacante proviene del token verificado y no del texto enviado por el navegador.
- Si falla el espejo hacia `opportunities`, la vacante se desactiva en lugar de quedar publicada a medias.
- Los CV de postulaciones se guardan en un bucket privado de 4 MB y se entregan mediante enlaces firmados de diez minutos sólo después de comprobar propiedad de la vacante.
- Si no se puede extraer texto, la postulación permanece y se marca para revisión manual.
- PDF, DOCX y TXT se procesan realmente en las herramientas empresariales; ya no se anuncian formatos que el backend rechaza.
- La incorporación al banco de talento es opcional y requiere consentimiento separado de la postulación.

Este documento separa claramente lo investigado, lo implementado, lo probado y lo pendiente. No debe interpretarse una fuente registrada como un scraper funcional.

## Resumen ejecutivo

- No se realizó deploy ni se escribió en Supabase durante este cierre.
- El registro contiene 40 fuentes priorizadas: 20 paraguayas y 20 internacionales/LatAm.
- Dos fuentes tienen ahora recolectores nuevos ejecutables y probados localmente: MEF/INAPP y FIUNA.
- La auditoría local encontró 27 candidatos: 6 de MEF/INAPP y 21 de FIUNA.
- Ninguno fue publicado. Todos se ejecutaron con revisión obligatoria y modo auditoría.
- CONACYT no se implementó porque el portal respondió HTTP 403 al acceso automatizado.
- Las otras fuentes registradas siguen siendo especificaciones de incorporación, no recolectores nuevos probados.

## Qué produjo la investigación de las 40 fuentes

El archivo `scrapers/source_registry.json` documenta por fuente:

- URL y mercado.
- Tier A, B o C.
- prioridad y valoración regional.
- tipos de oportunidad esperados.
- países o regiones elegibles.
- obligación de encontrar la fuente original.
- exclusiones, riesgos y reglas de revisión.
- valores seguros por defecto: recolección, catálogo, matching, alertas y SEO desactivados.

Esto sirve como contrato para implementar recolectores de forma consistente, pero por sí solo no incorpora oportunidades.

### Tier y publicación

- Tier A: publicador oficial. Puede llegar a publicación después de validar muestra y vigencia.
- Tier B: agregador. Debe seguirse la URL hasta el empleador u organizador original.
- Tier C: señal editorial o red social. Solo discovery; nunca publicación directa.

## Resultado real del primer lote

### MEF / INAPP

- Archivo: `scrapers/mef_inapp_becas_scraper.py`
- Estado del registro: `candidate`
- Fuente: oficial, Tier A.
- Encontradas: 6.
- Válidas: 6.
- Únicas: 6.
- Rechazadas: 0.
- Publicadas: 0.
- Extrae título, oferente, nivel, financiación, modalidad, lugar, deadline, detalle y enlace de postulación.
- Descarta automáticamente oportunidades vencidas.
- Mantener en revisión hasta comprobar manualmente las seis fichas completas.

### FIUNA

- Archivo: `scrapers/fiuna_job_board_scraper.py`
- Estado del registro: `candidate`
- Fuente: bolsa universitaria, Tier B.
- Encontradas: 21.
- Válidas estructuralmente: 21.
- Únicas: 21.
- Rechazadas: 0.
- Publicadas: 0.
- Solo toma avisos de los últimos 60 días.
- Extrae título, empresa aparente, descripción, fecha y contacto publicado.
- Todos quedan inactivos y en revisión porque FIUNA actúa como intermediaria.
- Antes de aprobar se debe verificar dominio de la empresa, vigencia y canal de postulación.

### CONACYT

- Estado: `research_pending`, acceso `blocked_403`.
- No existe scraper nuevo.
- No se intentó evadir el bloqueo.
- Próximo intento válido: feed, repositorio público, sección alternativa autorizada o coordinación con CONACYT.

## Pruebas disponibles

`tests/test_priority_scrapers.py` protege dos comportamientos esenciales:

- MEF descarta becas vencidas y conserva el enlace oficial de postulación.
- FIUNA descarta avisos antiguos y mantiene los resultados como agregados no verificados.

Comandos locales:

```powershell
python -m unittest tests.test_priority_scrapers -v
python scripts\validate_scraper_registry.py
python scripts\audit_scraper_contracts.py
```

Para una auditoría sin Supabase:

```powershell
$env:CVITAE_AUDIT_MODE='1'
$env:CVITAE_REQUIRE_REVIEW='1'
$env:CVITAE_AUDIT_OUTPUT='tmp/mef-inapp-audit.json'
python scrapers\mef_inapp_becas_scraper.py
```

## Qué no está terminado

- No se implementaron 40 scrapers nuevos.
- No se ejecutaron todas las fuentes registradas.
- No se insertaron las 27 oportunidades candidatas.
- No se activaron cron, catálogo, matching, alertas ni SEO para estas fuentes.
- No se conectaron estas fuentes nuevas al centro de control productivo.
- El scraper de VC4A/PES Latam es solo un esqueleto y devuelve cero resultados.
- CONACYT continúa sin canal automatizable confirmado.

## Estado de las otras áreas

El árbol local contiene cambios previos en landing, componentes visuales, guía de producto, páginas de oportunidades, admin, B2B, funciones de análisis y matching. Este cierre de scrapers no volvió a auditar funcionalmente esas áreas.

Por tanto:

- UI/UX: hay cambios locales, pero este documento no certifica su calidad visual ni responsive.
- Matching B2C: hay cambios locales en `supabase/functions/match-batch/index.ts`, pero no fue recalibrado ni evaluado con las 27 oportunidades.
- B2B: hay cambios locales en Recruiters y funciones de candidatos/vacantes, pero no se ejecutó una prueba completa de reclutador.
- Admin: tiene cambios amplios de control y moderación, pero los dos scrapers nuevos todavía no están activados en producción.
- Ayudas/tutoriales: existe `src/components/cv/ProductGuide.tsx`, pero no se revalidó en este cierre.

Antes de lanzar la beta estas áreas necesitan una verificación integral; la presencia de archivos modificados no equivale a aprobación QA.

## Cómo aprovechar las 40 fichas sin repetir la investigación

Para cada siguiente fuente:

1. Leer su entrada en `scrapers/source_registry.json`.
2. Confirmar que la página pública sigue vigente.
3. Crear el scraper con extracción separada de persistencia.
4. Emitir resultados mediante `OpportunitySink`.
5. Ejecutar primero con `CVITAE_AUDIT_MODE=1`.
6. Medir encontrados, válidos, únicos, rechazados y causas.
7. Revisar una muestra contra el publicador original.
8. Marcar `candidate` solo después de una ejecución real.
9. Activar por etapas: recolección, catálogo, matching/alertas y SEO.

## Próximo movimiento recomendado

No implementar otras 38 fuentes antes del lanzamiento. El orden con mayor retorno es:

1. Revisar manualmente las 6 becas MEF.
2. Verificar una muestra de FIUNA y decidir una regla para contactos por correo.
3. Ejecutar el flujo beta completo en staging: recolección, moderación del admin, aprobación, catálogo y detalle.
4. Recalibrar matching usando oportunidades reales aprobadas.
5. Realizar smoke tests B2C y B2B.
6. Hacer una sola revisión visual responsive y un único deploy agrupado.
7. Incorporar nuevas fuentes paraguayas en lotes de 2 a 3, guiándose por el registro.

## Criterio de salida para beta

La beta no debería medirse por cantidad bruta. El mínimo seguro es:

- oportunidades vigentes y aplicables;
- enlace o canal de postulación comprobado;
- moderación y reversión desde admin;
- ausencia de publicaciones automáticas desde Tier B/C;
- matching que explique por qué recomienda;
- recorrido B2C y B2B sin errores bloqueantes;
- telemetría que distinga cero resultados, fallo técnico y ausencia legítima de convocatorias.
